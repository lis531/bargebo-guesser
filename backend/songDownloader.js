import ytSearch from 'yt-search';
import { exec } from 'child_process';
import fs from 'fs';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "bargebo-27328.firebasestorage.app",
    databaseURL: process.env.FIREBASE_DATABASE_URL
});

const bucket = admin.storage().bucket();
const db = admin.database();

const LAST_FM_API_KEY = process.env.LAST_FM_API_KEY;
const REPLACE_FILES = false;
const DOWNLOAD_ONLY_NEW = true;
const REMOVE_ALL_SONGS = false;

const DOWNLOAD_BLOCK_SIZE = 4;
const YOUTUBE_SEARCH_BLOCK_SIZE = 50;
const RETRY_DELAY = 1000;
const DOWNLOAD_TIMEOUT = 30000;

const YT_DLP_CONFIG = {
    maxRetries: 2,
    fragmentRetries: 2,
    retrySleep: 3,
    throttledRate: '200K', // Limit bandwidth
    concurrentFragments: 1, // Reduce concurrent downloads
    ageLimit: 999 // Skip age-restricted content
};

async function removeAllSongs() {
    const [files] = await bucket.getFiles({ prefix: 'songs/' });
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);
    console.log('All songs removed from Firebase Storage.');
}
if (REMOVE_ALL_SONGS) {
    await removeAllSongs();
}

async function fetchTracks() {
    const limit = 50;
    const totalPages = 20;
    let allTracks = [];

    for (let page = 1; page <= totalPages; page++) {
        const url = `http://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LAST_FM_API_KEY}&format=json&limit=${limit}&page=${page}`;
        const response = await fetch(url);
        const data = await response.json();

        if (allTracks.some(track => track.name === data.tracks.track[0].name)) {
            continue;
        }

        if (data.tracks && data.tracks.track) {
            allTracks.push(...data.tracks.track);
        }
    }

    console.log(`Fetched ${allTracks.length} tracks from Last.fm`);

    const songs = allTracks.map(track => ({
        title: track.name,
        artist: track.artist.name,
        id: ''
    }));

    return songs;
}

async function updateSongDB() {
    let existingSongs = [];
    let blacklist = [];
    
    try {
        const songsSnapshot = await db.ref('/songs').once('value');
        const songsData = songsSnapshot.val();
        if (songsData && Array.isArray(songsData)) {
            existingSongs = songsData;
            console.log(`Loaded ${existingSongs.length} existing songs from Firebase Database`);
        }
    } catch (err) {
        console.error(`Error reading existing songs from Firebase: ${err.message}`);
    }

    try {
        const blacklistSnapshot = await db.ref('/blacklist').once('value');
        const blacklistData = blacklistSnapshot.val();
        if (blacklistData && Array.isArray(blacklistData)) {
            blacklist = blacklistData;
        }
    } catch (err) {
        console.error(`Error reading blacklist from Firebase: ${err.message}`);
    }

    const isBlacklisted = (song) =>
        blacklist.some(
            s =>
                s.title.toLowerCase() === song.title.toLowerCase() &&
                s.artist.toLowerCase() === song.artist.toLowerCase()
        );

    const existingTitleArtistPairs = new Set(
        existingSongs.map(song => `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`)
    );

    const uniqueExistingSongs = existingSongs.filter((song, index, self) => {
        const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
        return (
            index === self.findIndex(s => `${s.title.toLowerCase()}|${s.artist.toLowerCase()}` === key) &&
            !isBlacklisted(song)
        );
    });

    if (uniqueExistingSongs.length !== existingSongs.length) {
        console.log(`Found ${existingSongs.length - uniqueExistingSongs.length} duplicates or blacklisted in existing songs`);
        existingSongs = uniqueExistingSongs;
    }

    let newSongs = await fetchTracks();

    let uniqueNewSongs = newSongs.filter(song => {
        const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
        return !existingTitleArtistPairs.has(key) && !isBlacklisted(song);
    });

    console.log(`Found ${uniqueNewSongs.length} new unique songs`);

    const BLOCK_SIZE = YOUTUBE_SEARCH_BLOCK_SIZE;
    for (let blockID = 0; blockID < Math.ceil(uniqueNewSongs.length / BLOCK_SIZE); blockID++) {
        console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < uniqueNewSongs.length && j < BLOCK_SIZE; i++, j++) {
            const query = uniqueNewSongs[i].title + " " + uniqueNewSongs[i].artist;
            promises.push(ytSearch(query));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < uniqueNewSongs.length && j < BLOCK_SIZE; i++, j++) {
            const result = await promises[j];
            if (result.videos && result.videos.length > 0) {
                const videoURL = result.videos[0].url;
                const videoID = videoURL.split('watch?v=')[1];
                uniqueNewSongs[i].id = videoID;
            } else {
                console.log(`No video found for: ${uniqueNewSongs[i].title} - ${uniqueNewSongs[i].artist}`);
                uniqueNewSongs[i].id = null;
            }

            if ((i + 1) % 10 === 0) {
                console.log("Processed " + (i + 1) + " out of " + uniqueNewSongs.length + " songs.")
            }
        }

        // Add delay between blocks to avoid rate limiting
        if (blockID < Math.ceil(uniqueNewSongs.length / BLOCK_SIZE) - 1) {
            console.log("Waiting 3 seconds before next block...");
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    const allSongs = [...existingSongs, ...uniqueNewSongs];

    if (DOWNLOAD_ONLY_NEW) {
        await downloadSongsDB(uniqueNewSongs, blacklist);
    } else {
        await downloadSongsDB(allSongs, blacklist);
    }
}

async function downloadSong(videoUrl) {
    const videoID = videoUrl.split('watch?v=')[1];

    if (fs.existsSync('audio/' + videoID + '.opus')) {
        return new Promise((resolve, reject) => {
            resolve(`${videoID}.opus`);
        });
    }

    return new Promise((resolve, reject) => {
        exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:30" --force-overwrites --audio-format opus --audio-quality 64K --postprocessor-args "ffmpeg:-acodec libopus -b:a 64k -af loudnorm" -o "${`audio/${videoID}.opus`}" ${videoUrl}`, async (error) => {
            if (error) {
                console.error(`Error downloading track: ${error.message}`);
                reject(error);
            } else {
                console.log(`Track downloaded: ${stdout}`);
                resolve(`${videoID}.opus`);
            }
        });
    });
}

async function uploadFirebase(videoUrl) {
    const videoID = videoUrl.split('watch?v=')[1];
    const filePath = `audio/${videoID}.opus`;
    const file = bucket.file(`songs/${videoID}.opus`);

    try {
        const [exists] = await file.exists();

        if (exists && !REPLACE_FILES) {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2030'
            });
            return url;
        }

        return await new Promise((resolve, reject) => {
            const ytDlpArgs = [
                'yt-dlp',
                '--extractor-args "youtube:skip=hls,dash"', // Skip problematic streaming formats
                '--ignore-errors',
                '--no-warnings',
                `--age-limit ${YT_DLP_CONFIG.ageLimit}`, // Skip age-restricted videos
                '--skip-unavailable-fragments',
                '--abort-on-unavailable-fragment', // Stop if fragments are consistently unavailable
                `--retries ${YT_DLP_CONFIG.maxRetries}`, // Reduced retries to fail faster
                `--fragment-retries ${YT_DLP_CONFIG.fragmentRetries}`,
                `--retry-sleep ${YT_DLP_CONFIG.retrySleep}`,
                '--file-access-retries 2',
                `--throttled-rate ${YT_DLP_CONFIG.throttledRate}`, // Limit bandwidth to avoid throttling
                `--concurrent-fragments ${YT_DLP_CONFIG.concurrentFragments}`, // Reduce concurrent downloads
                '-x --audio-format opus --audio-quality 64K',
                '--download-sections "*1:00-1:30"',
                '--force-overwrites',
                '--postprocessor-args "ffmpeg:-acodec libopus -b:a 64k -af loudnorm"',
                `-o "${filePath}"`,
                `"${videoUrl}"`
            ];
            
            const ytDlpCommand = ytDlpArgs.join(' ');
            
            exec(ytDlpCommand, { timeout: DOWNLOAD_TIMEOUT }, async (error, stdout, stderr) => {
                const fileExists = fs.existsSync(filePath);
                let fileSize = 0;
                
                if (fileExists) {
                    const stats = fs.statSync(filePath);
                    fileSize = stats.size;
                }

                if (error || !fileExists) {
                    let errorMessage = 'Unknown download error';
                    
                    if (error) {
                        errorMessage = error.message;
                    } else if (!fileExists) {
                        errorMessage = 'No file was created';
                    }

                    const errorOutput = (stderr || '') + ' ' + errorMessage;
                    
                    if (errorOutput.includes('Sign in to confirm your age') || 
                        errorOutput.includes('age-restricted') ||
                        errorOutput.includes('inappropriate for some users') ||
                        errorOutput.includes('This video may be inappropriate for some users')) {
                        console.log(`❌ Age-restricted video: ${videoID}`);
                        reject(new Error('AGE_RESTRICTED'));
                        return;
                    }
                    
                    if (errorOutput.includes('HTTP error 403') ||
                        errorOutput.includes('Failed to open segment') ||
                        errorOutput.includes('Unable to download') ||
                        errorOutput.includes('DRM protected') ||
                        errorOutput.includes('SABR streaming') ||
                        errorOutput.includes('unable to extract uploader id') ||
                        errorOutput.includes('This live stream recording is not available')) {
                        console.log(`🚫 YouTube blocking download: ${videoID}`);
                        reject(new Error('YOUTUBE_BLOCKED'));
                        return;
                    }
                    
                    if (errorOutput.includes('Private video') ||
                        errorOutput.includes('Video unavailable') ||
                        errorOutput.includes('removed by the user') ||
                        errorOutput.includes('This video is not available') ||
                        errorOutput.includes('Video does not exist')) {
                        console.log(`❌ Video unavailable: ${videoID}`);
                        reject(new Error('VIDEO_UNAVAILABLE'));
                        return;
                    }

                    if (errorOutput.includes('Premieres in') ||
                        errorOutput.includes('This live event will begin in') ||
                        errorOutput.includes('Waiting for scheduled stream')) {
                        console.log(`⏳ Scheduled/premiere video: ${videoID}`);
                        reject(new Error('SCHEDULED_VIDEO'));
                        return;
                    }

                    console.error(`❌ Error downloading track ${videoID}: ${errorMessage}`);
                    reject(new Error(errorMessage));
                    return;
                }

                console.log(`✅ Downloaded ${videoID}.opus (${Math.round(fileSize / 1024)}KB)`);

                try {
                    const destination = `songs/${videoID}.opus`;
                    await bucket.upload(filePath, {
                        destination,
                        metadata: { contentType: 'audio/opus' }
                    });

                    console.log(`📤 Uploaded ${videoID}.opus to Firebase Storage.`);

                    const [url] = await bucket.file(destination).getSignedUrl({
                        action: 'read',
                        expires: '03-09-2030'
                    });

                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        console.warn(`Could not delete local file: ${e.message}`);
                    }
                    
                    resolve(url);
                } catch (uploadError) {
                    console.error(`❌ Error uploading to Firebase: ${uploadError.message}`);
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {}
                    reject(uploadError);
                }
            });
        });
    } catch (err) {
        console.error(`Unexpected error: ${err.message}`);
        return null;
    }
}

async function downloadSongsDB(songsDB, blacklist = []) {
    const BLOCK_SIZE = DOWNLOAD_BLOCK_SIZE;

    if (blacklist.length === 0) {
        try {
            const blacklistSnapshot = await db.ref('/blacklist').once('value');
            const blacklistData = blacklistSnapshot.val();
            if (blacklistData && Array.isArray(blacklistData)) {
                blacklist = blacklistData;
            }
        } catch (err) {
            console.error(`Error reading blacklist from Firebase: ${err.message}`);
        }
    }

    let successfulSongs = [];
    let errorStats = {
        AGE_RESTRICTED: 0,
        YOUTUBE_BLOCKED: 0,
        VIDEO_UNAVAILABLE: 0,
        SCHEDULED_VIDEO: 0,
        OTHER: 0
    };

    console.log(`🎵 Starting download of ${songsDB.length} songs in blocks of ${BLOCK_SIZE}...`);

    for (let blockID = 0; blockID < Math.ceil(songsDB.length / BLOCK_SIZE); blockID++) {
        const promises = [];
        const blockStart = blockID * BLOCK_SIZE;
        const blockEnd = Math.min(songsDB.length, blockStart + BLOCK_SIZE);

        console.log(`📦 Processing block ${blockID + 1}/${Math.ceil(songsDB.length / BLOCK_SIZE)} (songs ${blockStart + 1}-${blockEnd})`);

        for (let i = blockStart; i < blockEnd; i++) {
            promises.push(
                uploadFirebase(`https://www.youtube.com/watch?v=${songsDB[i].id}`)
                    .then(url => {
                        if (url) successfulSongs.push(songsDB[i]);
                        return url;
                    })
                    .catch(async error => {
                        const errorType = error.message;
                        let logMessage = '';
                        
                        switch(errorType) {
                            case 'AGE_RESTRICTED':
                                logMessage = `🔞 Age-restricted: ${songsDB[i].title} - ${songsDB[i].artist}`;
                                errorStats.AGE_RESTRICTED++;
                                break;
                            case 'YOUTUBE_BLOCKED':
                                logMessage = `🚫 YouTube blocked: ${songsDB[i].title} - ${songsDB[i].artist}`;
                                errorStats.YOUTUBE_BLOCKED++;
                                break;
                            case 'VIDEO_UNAVAILABLE':
                                logMessage = `❌ Unavailable: ${songsDB[i].title} - ${songsDB[i].artist}`;
                                errorStats.VIDEO_UNAVAILABLE++;
                                break;
                            case 'SCHEDULED_VIDEO':
                                logMessage = `⏳ Scheduled/premiere: ${songsDB[i].title} - ${songsDB[i].artist}`;
                                errorStats.SCHEDULED_VIDEO++;
                                break;
                            default:
                                logMessage = `💥 Failed: ${songsDB[i].title} - ${songsDB[i].artist} (${errorType})`;
                                errorStats.OTHER++;
                        }
                        
                        console.log(logMessage + '. Adding to blacklist.');
                        
                        const entry = { 
                            title: songsDB[i].title, 
                            artist: songsDB[i].artist, 
                            id: songsDB[i].id,
                            errorType: errorType,
                            timestamp: new Date().toISOString()
                        };
                        
                        if (!blacklist.some(s => s.title === entry.title && s.artist === entry.artist && s.id === entry.id)) {
                            blacklist.push(entry);
                            try {
                                await db.ref('/blacklist').set(blacklist);
                            } catch (dbError) {
                                console.error(`Error updating blacklist in Firebase: ${dbError.message}`);
                            }
                        }
                    })
            );
        }
        
        await Promise.all(promises);
        
        // Progress update
        const processed = blockEnd;
        const successRate = Math.round((successfulSongs.length / processed) * 100);
        console.log(`📊 Progress: ${processed}/${songsDB.length} processed | ${successfulSongs.length} successful (${successRate}%)`);
        
        // Add delay between blocks to avoid rate limiting
        if (blockID < Math.ceil(songsDB.length / BLOCK_SIZE) - 1) {
            console.log(`⏳ Waiting ${RETRY_DELAY / 1000} seconds before next block...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }

    // Final statistics
    console.log(`\n📋 Download Summary:`);
    console.log(`✅ Successful: ${successfulSongs.length}/${songsDB.length} (${Math.round((successfulSongs.length / songsDB.length) * 100)}%)`);
    console.log(`🔞 Age-restricted: ${errorStats.AGE_RESTRICTED}`);
    console.log(`🚫 YouTube blocked: ${errorStats.YOUTUBE_BLOCKED}`);
    console.log(`❌ Unavailable: ${errorStats.VIDEO_UNAVAILABLE}`);
    console.log(`⏳ Scheduled/premiere: ${errorStats.SCHEDULED_VIDEO}`);
    console.log(`💥 Other errors: ${errorStats.OTHER}`);

    try {
        const existingSongsSnapshot = await db.ref('/songs').once('value');
        const existingSongsData = existingSongsSnapshot.val() || [];
        
        const previousSongs = Array.isArray(existingSongsData) ? existingSongsData : [];
        const allSongs = [...previousSongs, ...successfulSongs].reduce((map, song) => { 
            map.set(song.id, song); 
            return map; 
        }, new Map()).values();
        const merged = Array.from(allSongs);
        
        await db.ref('/songs').set(merged);
        console.log(`🔥 Firebase songs database updated: ${merged.length} total songs. Added ${successfulSongs.length} new songs.`);
    } catch (error) {
        console.error(`❌ Error updating Firebase songs database: ${error.message}`);
    }
}

await updateSongDB();