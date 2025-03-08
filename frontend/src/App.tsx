import { useState, useEffect } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import { io } from "socket.io-client";

// const socket = io("http://130.162.248.218:2137");
const socket = io("http://localhost:2137");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState([]);
	const [lobbyNames, setLobbyNames] = useState([]);
	const [currentLobby, setCurrentLobby] = useState("");
	const [selectedSong, setSelectedSong] = useState<{ id: string; title: string; artist: string } | null>(null);
	const [songs, setSongs] = useState<{ id: string; title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();

	useEffect(() => {
		socket.on('onLobbyListChanged', (lobbyNames) => {
			setLobbyNames(lobbyNames);
			console.log("Lobby names changed: ", lobbyNames);
		});

		socket.on('onPlayersChanged', (players) => {
			setLobbyPlayers(players);
			console.log("Players changed: ", players);
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

		socket.on('onRoundStart', (allSongs, correctIndex, correctSongData) => {
			setCorrectSongIndex(correctIndex);

			console.log("Starting round: ", allSongs, " correct index: ", correctIndex);

			setSongs(allSongs);

			const context = new AudioContext();
			context.decodeAudioData(correctSongData, (buffer) => {
				const source = context.createBufferSource();
				source.buffer = buffer;
				source.connect(context.destination);
				source.start(0, 40.0, 30.0);
			}, (err) => { 
				console.log("Playback error: " + err); 
			})
		});

		socket.on('onRoundEnd', () => {
			console.log("Ending round.");
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

	const startRound = () => {
		socket.emit('announceRoundStart', lobbyName);
	}

	const endRound = () => {
		socket.emit('announceRoundEnd', lobbyName);
	}

	const submitAnswer = (choiceIndex: number) => {
		socket.emit('submitAnswer', lobbyName, choiceIndex);
	}

	const onSongSelection = (song: { id: string; title: string; artist: string; url: string }) => {
		setSelectedSong(song);
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
					<button type="submit" onClick={() => endRound()}>End Round</button>
				</div>

				<audio id="audio-player"></audio>
			</div>
			<SongPicker songs={songs} onSongSelect={onSongSelection} />
		</div>
	);
}

export default App;