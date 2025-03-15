import { useState, useEffect, useRef } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import Leaderboard from './Leaderboard.tsx';
import { io } from "socket.io-client";

// const socket = io("http://localhost:2137/");
const socket = io("https://bargebo-00fc4919d1db.herokuapp.com/");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
	const [songs, setSongs] = useState<{ title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();
	
	const initialVolume = Number(localStorage.getItem('volume')) || 50;
	const audioContextRef = useRef<AudioContext | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const sourceAudioBufferRef = useRef<AudioBufferSourceNode | null>(null);

	useEffect(() => {
		audioContextRef.current = new AudioContext();
		gainNodeRef.current = audioContextRef.current.createGain();
		gainNodeRef.current.gain.value = 0.25;
		gainNodeRef.current.connect(audioContextRef.current.destination);

		const handleLobbyListChange = (lobbyNames: any[]) => {
			console.log("Lobby names changed: ", lobbyNames);
		};

		const handlePlayersChange = (players: any[]) => {
			setLobbyPlayers(players);
			console.log("Players changed: ", players);
		};

		socket.on('onLobbyListChanged', handleLobbyListChange);
		socket.on('onPlayersChanged', handlePlayersChange);

		socket.on('onLobbyListChanged', (lobbyNames) => {
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
			switchGameUI();
			document.querySelector(".host-controls")?.classList.remove("hidden");
			document.querySelector('.timer')?.classList.add('invisible');
			document.querySelector('.song-picker')?.classList.add('invisible');
			console.log("Successfully created a lobby called: ", lobbyName);
		});

		socket.on("joinLobbyResponse", (err) => {
			if (err !== '') {
				console.log("Error while joining a lobby: ", err);
				return;
			}
			switchGameUI();
			console.log("Successfully joined a lobby called: ", lobbyName);
		});

		socket.on('onGameStart', () => {
			document.querySelector('.host-controls')?.classList.add('hidden');
			document.querySelector('.timer')?.classList.remove('hidden');
		});

		socket.on('onRoundStart', async (allSongs, correctIndex, correctSongData, currentRounds, rounds) => {
			if (sourceAudioBufferRef.current !== null) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}

			resetSongSelection();
			setCorrectSongIndex(correctIndex);
			setSongs(allSongs);

			const roundNumber = document.getElementById('roundNumber') as HTMLElement;
			roundNumber.innerHTML = `Round: ${currentRounds} / ${rounds}`;

			document.querySelector('.timer')?.classList.remove('invisible');
			document.querySelector('.song-picker')?.classList.remove('invisible');

			audioContextRef.current!.decodeAudioData(correctSongData, (buffer) => {
				sourceAudioBufferRef.current = audioContextRef.current!.createBufferSource();
				sourceAudioBufferRef.current.connect(gainNodeRef.current!);
				sourceAudioBufferRef.current.buffer = buffer;
				sourceAudioBufferRef.current.start();
			}, (err) => {
				console.log("Playback error: " + err);
			});
		});

		socket.on('onGameEnd', () => {
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			console.log("Game ended.");
			switchGameUI();
		});

		socket.on('onRoundEnd', () => {
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			socket.emit('announceRoundStart', lobbyName);
			console.log("Ending round.");
		});

		socket.on('timerChange', (timePassed) => {
			const timerParagraphs = document.querySelectorAll('.timer > p');
			if (timerParagraphs.length > 1) {
				timerParagraphs[1].innerHTML = timePassed.toString();
			}
		});

		return () => {
			socket.off('onLobbyListChanged', handleLobbyListChange);
			socket.off('onPlayersChanged', handlePlayersChange);
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	const switchGameUI = () => {
		console.log("Switching UI");
		document.querySelector(".start-screen-content")?.classList.toggle("hidden");
		document.querySelector("footer")?.classList.toggle("hidden");
		document.querySelector(".game-screen-content")?.classList.toggle("hidden");
		document.querySelector(".song-picker")?.classList.toggle("hidden");
		document.querySelector(".sidebar")?.classList.toggle("hidden");
	};

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

	const startGame = () => {
		const rounds = parseInt((document.getElementById('rounds') as HTMLInputElement).value);
		const feedbackElement = document.getElementById('feedback') as HTMLElement;
		if (rounds < 1 || rounds > 30 || isNaN(rounds)) {
			feedbackElement.innerHTML = "Invalid number of rounds.";
			return;
		} else {
			feedbackElement.innerHTML = "";
		}
		socket.emit('announceGameStart', lobbyName, rounds);
		socket.emit('announceRoundStart', lobbyName);
	};

	const submitAnswer = (choiceIndex: number) => {
		socket.emit('submitAnswer', lobbyName, choiceIndex);
	};

	const resetSongSelection = () => {
		const songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
		songsTiles.forEach((tile) => {
			tile.classList.remove("selected", "disabled", "correct", "incorrect");
		});
	};

	const onSongSelection = (index: number) => {
		submitAnswer(index);
		const songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
		songsTiles.forEach((tile) => {
			if (Number(tile.id) === index) {
				tile.classList.add(correctSongIndex === index ? "correct" : "incorrect");
			}
		});
	};

	const changeVolume = (volume: number) => {
		localStorage.setItem('volume', volume.toString());
		if (gainNodeRef.current) {
			gainNodeRef.current.gain.value = volume / 200;
		}
	};

	return (
		<div className="main">
			<div className='sidebar hidden'>
				<Leaderboard players={lobbyPlayers} />
				<div className='volume'>
					<label htmlFor="volume">Volume</label>
					<input
						id="volume"
						type='range'
						defaultValue={initialVolume}
						min={0}
						max={100}
						step={1}
						onChange={(e) => changeVolume(parseInt(e.target.value))}
					/>
				</div>
			</div>
			<div>
				<div className="main-screen">
					<h1>BARGEBO GUESSER</h1>
					<div className='start-screen-content'>
						<div className='start-screen-inputs'>
							<label>Username:</label>
							<input
								placeholder="username"
								name="usernameInput"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								type="text"
							/>
							<label>Lobby Name:</label>
							<input
								placeholder="lobby name"
								name="lobbyInput"
								value={lobbyName}
								onChange={(e) => setLobbyName(e.target.value)}
								type="text"
							/>
						</div>
						<div className='start-screen-buttons'>
							<button type="submit" onClick={joinLobby}>Join Lobby</button>
							<button type="submit" onClick={createLobby}>Create Lobby</button>
						</div>
					</div>
					<div className='game-screen-content hidden'>
						<h1 className='timer hidden'><p>Timer:</p><p>0</p></h1>
						<div className='host-controls hidden'>
							<div>
								<label>Number of rounds:</label>
								<input id='rounds' type="number" min={1} max={30} placeholder="Number of rounds" />
								<p id='feedback' className='error'></p>
								<button className='submitButton' type="submit" onClick={startGame}>Start</button>
							</div>
						</div>
					</div>
					<SongPicker songs={songs} onSongSelect={onSongSelection} />
					<footer>Borys Gajewki & Mateusz Antkiewicz @ 2025</footer>
				</div>
			</div>
		</div>
	);
}

export default App;
