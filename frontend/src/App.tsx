import { useState, useEffect } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import { io } from "socket.io-client";

const socket = io("http://130.162.248.218:2137");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState([]);
	const [lobbyNames, setLobbyNames] = useState([]);
	const [currentLobby, setCurrentLobby] = useState("");
	const [selectedSong, setSelectedSong] = useState<{ id: string; title: string; artist: string } | null>(null);
	const [songs, setSongs] = useState<{ id: string; title: string; artist: string; cover: string; url: string; }[]>([]);	

	useEffect(() => {
		socket.on('onLobbyListChanged', (lobbyNames) => {
			setLobbyNames(lobbyNames);

			console.log("Lobby names changed: ", lobbyNames);
		});
		socket.on('onPlayersChanged', (players) => {
			setLobbyPlayers(players);

			console.log("Players changed: ", players);
		});

		socket.on('onRoundStart', (allSongs, correctIndex) => {
			console.log("Starting round: ", allSongs, " correct: ", correctIndex);
		});
		socket.on('onRoundEnd', () => {
			console.log("Ending round.");
		});
	
		socket.on("createLobbyResponse", (lobbyName, err) => {
			if (err !== '') {
				console.log("Error while creating a lobby: ", err);
				return;
			}

			console.log("Successfully created a lobby called: ", lobbyName);
		});

		socket.on("joinLobbyResponse", (err) => {
			if (err !== '') {
				console.log("Error while joining a lobby: ", err);
				return;
			}

			console.log("Successfully joined a lobby called: ", lobbyName);
		});
	}, [])

	const createLobby = () => {
		if (lobbyName && username) {
			socket.emit("createLobby", lobbyName, username);
		}
	};

	const joinLobby = () => {
		if (lobbyName && username) {
			socket.emit("joinLobby", lobbyName, username);
		}
	};

	const startRound = () => {
		socket.emit('announceRoundStart', lobbyName);
	}

	const submitAnswer = (choiceIndex: number) => {
		socket.emit('submitAnswer', lobbyName, choiceIndex);
	}

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " ") {
				console.log(lobbyNames);
			}
		};
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [lobbyNames]);

	interface Artist {
		name: string;
	}

	interface Track {
		album: any;
		name: string;
		artists: Artist[];
		popularity: number;
		url: string;
	}

	async function getAccessToken() {
		const clientId = 'b8156c11c6ca4c32b541d3392225aed3';
		const clientSecret = '24d6189fba74450fb8a7917fa150fcea';

		const response = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${btoa(clientId + ':' + clientSecret)}`,
			},
			body: 'grant_type=client_credentials',
		});

		const data = await response.json();
		return data.access_token;
	}

	async function fetchWebApi(endpoint: string, method: string, body?: any) {
		const token = await getAccessToken();
		const res = await fetch(`https://api.spotify.com/${endpoint}`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
			method,
			body: body ? JSON.stringify(body) : undefined,
		});

		return await res.json();
	}


	async function getPopularTracks(): Promise<Track[]> {
		const data = await fetchWebApi(
			'v1/search?q=track&type=track&limit=50', 'GET', undefined
		);

		const popularTracks = data.tracks.items.filter((track: Track) => track.popularity > 50);

		return popularTracks;
	}

	useEffect(() => {
		const fetchTracks = async () => {
			const popularTracks = await getPopularTracks();

			if (popularTracks.length === 0) {
				console.log('No tracks found with popularity > 50.');
				return;
			}

			const selectedTracks = [];
			for (let i = 0; i < 4; i++) {
				const randomTrack = popularTracks[Math.floor(Math.random() * popularTracks.length)];
				selectedTracks.push(randomTrack);
			}

			setSongs(selectedTracks.map(track => ({
				id: track.name,
				title: track.name,
				artist: track.artists.map(artist => artist.name).join(', '),
				cover: track.album.images[0].url,
				url: track.url,
			})));
		};

		fetchTracks();
	}, []);

	const onSongSelection = (song: { id: string; title: string; artist: string; url: string }) => {
		setSelectedSong(song);
		
	};

	const playSong = () => {
		if (songs.length === 0) {
			console.log("No songs available to play.");
			return;
		}
	
		const randomIndex = Math.floor(Math.random() * songs.length);
		const randomSong = songs[randomIndex];
	
		const audio = new Audio(randomSong.url);
		audio.play();
	
		console.log(`Playing: ${randomSong.title} by ${randomSong.artist}`);
	};
	

	return (
		<div className="start-screen">
			<h1>BARGEBO GUESSER</h1>
			<div>
				<div className='start-screen-inputs'>
					<input placeholder="username" name="usernameInput" value={username} onChange={(e) => setUsername(e.target.value)} type="text" />
					<input placeholder="lobby name" name="lobbyInput" value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} type="text" />
				</div>
				<div className='start-screen-buttons'>
					<button type="submit" onClick={() => joinLobby()}>Join Lobby</button>
					<button type="submit" onClick={() => createLobby()}>Create Lobby</button>
					<button type="submit" onClick={() => startRound()}>Start Round</button>
				</div>
			</div>
			<button onClick={() => playSong()}>Play Song</button>
			<SongPicker songs={songs} onSongSelect={onSongSelection} />
		</div>
	);
}

export default App;