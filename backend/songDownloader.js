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
const REPLACE_FILES = true;

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
    if (fs.existsSync('db.json')) {
        try {
            const fileContent = fs.readFileSync('db.json', 'utf8');
            if (fileContent && fileContent.trim() !== '') {
                existingSongs = JSON.parse(fileContent);
                console.log(`Loaded ${existingSongs.length} existing songs from db.json`);
            }
        } catch (err) {
            console.error(`Error reading existing db.json: ${err.message}`);
        }
    }

    const existingTitleArtistPairs = new Set(existingSongs.map(song => `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`));

    const uniqueExistingSongs = existingSongs.filter((song, index, self) => {
        const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
        return index === self.findIndex(s => `${s.title.toLowerCase()}|${s.artist.toLowerCase()}` === key);
    });

    if (uniqueExistingSongs.length !== existingSongs.length) {
        console.log(`Found ${existingSongs.length - uniqueExistingSongs.length} duplicates in existing songs`);
        existingSongs = uniqueExistingSongs;
    }

    let newSongs = await fetchTracks();

    const uniqueNewSongs = newSongs.filter(song => { const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`; return !existingTitleArtistPairs.has(key); });

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

    fs.writeFile('db.json', JSON.stringify(allSongs), (err) => {
        if (err) {
            console.error('Error writing file:', err);
        } else {
            console.log(`File written successfully with ${allSongs.length} total songs!`);
        }
    });

    for (let i = 0; i < allSongs.length; i++) {
        allSongs[i].cover = `https://img.youtube.com/vi/${allSongs[i].id}/0.jpg`;
        allSongs[i].url = `https://www.youtube.com/watch?v=${allSongs[i].id}`;
        delete allSongs[i].id;
    }
    await downloadSongsDB(allSongs);
}

async function downloadSong(videoUrl) {
    const videoID = videoUrl.split('watch?v=')[1];

    if (fs.existsSync('audio/' + videoID + '.mp3')) {
        return new Promise((resolve, reject) => {
            resolve(`${videoID}.mp3`);
        });
    }

    return new Promise((resolve, reject) => {
        exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:10" --force-overwrites -filter:a dynaudnorm --audio-format mp3 -o "audio/${videoID}.%(ext)s" ${videoUrl}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error downloading track: ${error.message}`);
                reject(error);
            } else {
                console.log(`Track downloaded: ${stdout}`);
                resolve(`${videoID}.mp3`);
            }
        });
    });
}

async function uploadFirebase(videoUrl) {
    const videoID = videoUrl.split('watch?v=')[1];
    const filePath = `audio/${videoID}.mp3`;
    const file = bucket.file(`songs/${videoID}.mp3`);

    try {
        const [exists] = await file.exists();

        if (exists && !REPLACE_FILES) {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2030'
            });
            // console.log(`already exists in Firebase Storage.`);
            return url;
        }

        return await new Promise((resolve, reject) => {
            exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:20" --force-overwrites --audio-format mp3 --postprocessor-args "ffmpeg:-filter:a dynaudnorm" -o "${filePath}" ${videoUrl}`, async (error) => {
                if (error) {
                    console.error(`Error downloading track: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`Downloaded ${videoID}.mp3`);

                try {
                    const destination = `songs/${videoID}.mp3`;
                    await bucket.upload(filePath, {
                        destination,
                        metadata: { contentType: 'audio/mpeg' }
                    });

                    console.log(`Uploaded ${videoID}.mp3 to Firebase Storage.`);

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
    for (let blockID = 0; blockID < Math.ceil(songsDB.length / BLOCK_SIZE); blockID++) {
        //console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < songsDB.length && j < BLOCK_SIZE; i++, j++) {
            promises.push(uploadFirebase(songsDB[i].url));
            //promises.push(downloadSong(songsDB[i].url));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < songsDB.length && j < BLOCK_SIZE; i++, j++) {
            await promises[j];
            if ((i + 1) % 100 === 0) {
                console.log("Downloaded " + (i + 1) + " out of " + songsDB.length + " songs.")
            }
        }
    }
}

await updateSongDB();