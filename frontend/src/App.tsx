import { useState, useEffect, useRef } from 'react';
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
	const [selectedSong, setSelectedSong] = useState<{ id: number; title: string; artist: string } | null>(null);
	const [songs, setSongs] = useState<{ id: number; title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();
	const audioContextRef = useRef<AudioContext | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);	

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
			setSongs(allSongs);
		
			audioContextRef.current = new AudioContext();
			gainNodeRef.current = audioContextRef.current.createGain();
			gainNodeRef.current.gain.value = 0.25;
			gainNodeRef.current.connect(audioContextRef.current.destination);

			if (!audioContextRef.current || !gainNodeRef.current) return;
		
			audioContextRef.current.decodeAudioData(correctSongData, (buffer) => {
				const source = audioContextRef.current!.createBufferSource();
				source.buffer = buffer;
				source.connect(gainNodeRef.current!);
				source.start(0, 40.0, 30.0);
			}, (err) => {
				console.log("Playback error: " + err);
			});
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

	const onSongSelection = (song: { id: number; title: string; artist: string; url: string }) => {
		setSelectedSong(song);
		let songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
		if(correctSongIndex == song.id) {
			Array.from(songsTiles).map((tile) => {
				if (Number(tile.id) == song.id) {
					tile.classList.add("correct");
				}
			});
		} else {
			Array.from(songsTiles).map((tile) => {
				if (Number(tile.id) == song.id) {
					tile.classList.add("incorrect");
				}
			});
		}
	};

    const changeVolume = (volume: number) => {
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = volume / 200;
        }
    }

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
				<label htmlFor="volume">Volume</label>
				<input id="volume" type='range' min={0} max={100} step={1} onChange={(e) => changeVolume(parseInt(e.target.value))}/>
			</div>
			<SongPicker songs={songs} onSongSelect={onSongSelection}/>
		</div>
	);
}

export default App;