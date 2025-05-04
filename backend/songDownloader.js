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
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "bargebo-27328.firebasestorage.app"
});

const bucket = admin.storage().bucket();

const LAST_FM_API_KEY = process.env.LAST_FM_API_KEY;
const REPLACE_FILES = false;
const DOWNLOAD_ONLY_NEW = true;
const REMOVE_ALL_SONGS = false;

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
    if (fs.existsSync('songDB.json')) {
        try {
            const fileContent = fs.readFileSync('songDB.json', 'utf8');
            if (fileContent && fileContent.trim() !== '') {
                existingSongs = JSON.parse(fileContent);
                console.log(`Loaded ${existingSongs.length} existing songs from songDB.json`);
            }
        } catch (err) {
            console.error(`Error reading existing songDB.json: ${err.message}`);
        }
    }
    if (fs.existsSync('blacklist.json')) {
        try {
            const content = fs.readFileSync('blacklist.json', 'utf8');
            if (content && content.trim() !== '') {
                blacklist = JSON.parse(content);
            }
        } catch (err) {
            console.error(`Error reading blacklist.json: ${err.message}`);
        }
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

    const BLOCK_SIZE = 100;
    for (let blockID = 0; blockID < Math.ceil(uniqueNewSongs.length / BLOCK_SIZE); blockID++) {
        console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < uniqueNewSongs.length && j < BLOCK_SIZE; i++, j++) {
            const query = uniqueNewSongs[i].title + " " + uniqueNewSongs[i].artist;
            promises.push(ytSearch(query));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < uniqueNewSongs.length && j < BLOCK_SIZE; i++, j++) {
            const result = await promises[j];
            const videoURL = result.videos[0].url;
            const videoID = videoURL.split('watch?v=')[1];
            uniqueNewSongs[i].id = videoID;

            if ((i + 1) % 10 === 0) {
                console.log("Processed " + (i + 1) + " out of " + uniqueNewSongs.length + " songs.")
            }
        }
    }

    const allSongs = [...existingSongs, ...uniqueNewSongs];

    if (DOWNLOAD_ONLY_NEW) {
        await downloadSongsDB(uniqueNewSongs);
    } else {
        await downloadSongsDB(allSongs);
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
            exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:30" --force-overwrites --audio-format opus --audio-quality 64K --postprocessor-args "ffmpeg:-acodec libopus -b:a 64k -af loudnorm" -o "${filePath}" ${videoUrl}`, async (error) => {
                if (error) {
                    console.error(`Error downloading track: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`Downloaded ${videoID}.opus`);

                try {
                    const destination = `songs/${videoID}.opus`;
                    await bucket.upload(filePath, {
                        destination,
                        metadata: { contentType: 'audio/opus' }
                    });

                    console.log(`Uploaded ${videoID}.opus to Firebase Storage.`);

                    const [url] = await bucket.file(destination).getSignedUrl({
                        action: 'read',
                        expires: '03-09-2030'
                    });

                    fs.unlinkSync(filePath);
                    resolve(url);
                } catch (uploadError) {
                    console.error(`Error uploading to Firebase: ${uploadError.message}`);
                    reject(uploadError);
                }
            });
        });
    } catch (err) {
        console.error(`Unexpected error: ${err.message}`);
        return null;
    }
}

async function downloadSongsDB(songsDB) {
    const BLOCK_SIZE = 4;
    let blacklist = [];

    if (fs.existsSync('blacklist.json')) {
        try {
            const content = fs.readFileSync('blacklist.json', 'utf8');
            if (content && content.trim() !== '') {
                blacklist = JSON.parse(content);
            }
        } catch (err) {
            console.error(`Error reading blacklist.json: ${err.message}`);
        }
    }

    let successfulSongs = [];

    for (let blockID = 0; blockID < Math.ceil(songsDB.length / BLOCK_SIZE); blockID++) {
        const promises = [];
        const blockStart = blockID * BLOCK_SIZE;
        const blockEnd = Math.min(songsDB.length, blockStart + BLOCK_SIZE);

        for (let i = blockStart; i < blockEnd; i++) {
            promises.push(
                uploadFirebase(`https://www.youtube.com/watch?v=${songsDB[i].id}`)
                    .then(url => {
                        if (url) successfulSongs.push(songsDB[i]);
                        return url;
                    })
                    .catch(error => {
                        console.log(`Failed to download/upload song: ${songsDB[i].title} - ${songsDB[i].artist}. Blacklisting.`);
                        const entry = { title: songsDB[i].title, artist: songsDB[i].artist, id: songsDB[i].id };
                        if (!blacklist.some(s => s.title === entry.title && s.artist === entry.artist && s.id === entry.id)) {
                            blacklist.push(entry);
                            fs.writeFileSync('blacklist.json', JSON.stringify(blacklist, null, 2));
                        }
                    })
            );
        }
        await Promise.all(promises);
        if ((blockEnd) % 100 === 0) {
            console.log(`Processed ${blockEnd} / ${songsDB.length} songs.`);
        }
    }

    const previousSongs = fs.existsSync('songDB.json') ? JSON.parse(fs.readFileSync('songDB.json', 'utf8')) : [];
    const allSongs = [...previousSongs, ...successfulSongs].reduce((map, song) => { map.set(song.id, song); return map; }, new Map()).values();
    const merged = Array.from(allSongs);
    fs.writeFileSync('songDB.json', JSON.stringify(merged, null, 2));
    console.log(`songDB.json updated: ${merged.length} total songs.`);
}

await updateSongDB();