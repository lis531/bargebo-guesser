import { useState, useEffect, useRef } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import Leaderboard from './Leaderboard.tsx';
import { io } from "socket.io-client";

// const socket = io("http://130.162.248.218:2137");
const socket = io("http://localhost:2137");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState([]);
	const [lobbyNames, setLobbyNames] = useState([]);
	const [currentLobby, setCurrentLobby] = useState("");
	const [selectedSong, setSelectedSong] = useState<number>();
	const [songs, setSongs] = useState<{ title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();
	const [initialVolume, setInitialVolume] = useState<number>(Number(localStorage.getItem('volume')) || 50);
	const audioContextRef = useRef<AudioContext | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const sourceAudioBufferRef = useRef<AudioBufferSourceNode | null>(null);

	useEffect(() => {
		audioContextRef.current = new AudioContext();

		gainNodeRef.current = audioContextRef.current.createGain();
		gainNodeRef.current.gain.value = 0.25;
		gainNodeRef.current.connect(audioContextRef.current.destination);

		changeVolume(initialVolume);

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
			switchUI();
			console.log("Successfully created a lobby called: ", lobbyName);
		});

		socket.on("joinLobbyResponse", (err) => {
			if (err !== '') {
				console.log("Error while joining a lobby: ", err);
				return;
			}
			switchUI();
			console.log("Successfully joined a lobby called: ", lobbyName);
		});

		socket.on('onRoundStart', (allSongs, correctIndex, correctSongData) => {
			if (sourceAudioBufferRef.current !== null) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}

			resetSongSelection();
			setSelectedSong(-1);
			setCorrectSongIndex(correctIndex);
			setSongs(allSongs);

			audioContextRef.current!.decodeAudioData(correctSongData, (buffer) => {
				sourceAudioBufferRef.current = audioContextRef.current!.createBufferSource();
				sourceAudioBufferRef.current.connect(gainNodeRef.current!);
				sourceAudioBufferRef.current.buffer = buffer;
				sourceAudioBufferRef.current.start();
			}, (err) => {
				console.log("Playback error: " + err);
			});
		});

		socket.on('onRoundEnd', () => {
			if (sourceAudioBufferRef.current !== null) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}

			console.log("Ending round.");
		});

		socket.on('timerChange', (timePassed) => {
			document.querySelectorAll('.timer > p')[1].innerHTML = timePassed.toString();
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

	const resetSongSelection = () => {
		const songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
		Array.from(songsTiles).map((tile) => {
			tile.classList.remove("selected");
			tile.classList.remove("disabled");
			tile.classList.remove("correct");
			tile.classList.remove("incorrect");
		});
	}

	let hasSwitched = false;

	const switchUI = () => {
		if (hasSwitched) return;
		hasSwitched = true;
	
		console.log("Switching UI");
		document.querySelector(".start-screen-content")!.classList.toggle("hidden");
		document.querySelector("footer")!.classList.toggle("hidden");
		document.querySelector(".game-screen-content")!.classList.toggle("hidden");
		document.querySelector(".song-picker")!.classList.toggle("hidden");
	};	

	const onSongSelection = (index: number) => {
		setSelectedSong(index);

		submitAnswer(index);

		const songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;

		if (correctSongIndex == index) {
			Array.from(songsTiles).map((tile) => {
				if (Number(tile.id) == index) {
					tile.classList.add("correct");
				}
			});
		} else {
			Array.from(songsTiles).map((tile) => {
				if (Number(tile.id) == index) {
					tile.classList.add("incorrect");
				}
			});
		}
	};

	const changeVolume = (volume: number) => {
		localStorage.setItem('volume', volume.toString());
		if (gainNodeRef.current) {
			gainNodeRef.current.gain.value = volume / 200;
		}
	}

	return (
		<div className="main">
			<Leaderboard players={lobbyPlayers} />
			<div>
				<div className="main-screen">
					<h1>BARGEBO GUESSER</h1>
					<div className='start-screen-content'>
						<div className='start-screen-inputs'>
							<label>Username:</label>
							<input placeholder="username" name="usernameInput" value={username} onChange={(e) => setUsername(e.target.value)} type="text" />
							<label>Lobby Name:</label>
							<input placeholder="lobby name" name="lobbyInput" value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} type="text" />
						</div>
						<div className='start-screen-buttons'>
							<button type="submit" onClick={() => joinLobby()}>Join Lobby</button>
							<button type="submit" onClick={() => createLobby()}>Create Lobby</button>
						</div>
					</div>
					<div className='game-screen-content hidden'>
						<h1 className='timer'><p>Timer:</p><p>0</p></h1>
						<div className='volume'>
							<label htmlFor="volume">Volume</label>
							<input id="volume" type='range' defaultValue={initialVolume} min={0} max={100} step={1} onChange={(e) => changeVolume(parseInt(e.target.value))} />
						</div>
						<button className='submitButton' type="submit" onClick={() => startRound()}>Start Round</button>
					</div>
					<SongPicker songs={songs} onSongSelect={onSongSelection} />
					<footer>Borys Gajewki & Mateusz Antkiewicz @ 2025</footer>
				</div>
			</div>
		</div>
	);
}

export default App;