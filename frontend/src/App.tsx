import { useState, useEffect, useRef } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import Sidebar from './Sidebar.tsx';
import GameSummary from './GameSummary.tsx';
import { io } from "socket.io-client";

// const socket = io("http://localhost:2137/");
const socket = io("https://bargebo-00fc4919d1db.herokuapp.com/");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
	const [songs, setSongs] = useState<{ title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();

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
			document.querySelector('.timer')?.classList.add('hidden');
			document.querySelector('.song-picker')?.classList.add('hidden');
			console.log("Successfully joined a lobby called: ", lobbyName);
		});

		socket.on('onGameStart', () => {
			document.querySelector('.host-controls')?.classList.add('hidden');
			document.querySelector('.timer')?.classList.remove('hidden');
			document.querySelector('.song-picker')?.classList.remove('hidden');
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
			if (document.querySelector('.song-picker')?.classList.contains('invisible')) {
				document.querySelector('.song-picker')?.classList.remove('invisible');
				document.querySelector('.song-picker')?.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0%)' }], { duration: 500, easing: 'ease', fill: 'forwards' });
			}

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
			document.querySelector('.game-screen-content')?.classList.add('hidden');
			document.querySelector('.song-picker')?.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(100%)' }], { duration: 500, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				// get innerwidth of the sidebar
				const sidebarWidth = document.querySelector('.sidebar')?.getBoundingClientRect().width;
				document.querySelector('.song-picker')?.classList.add('hidden');
				document.querySelector('.main-screen')?.animate([{ paddingLeft: `${sidebarWidth}px` }, { paddingLeft: '0%' }], { duration: 500, easing: 'ease', fill: 'forwards' });
				document.querySelector(".sidebar")?.animate([{ transform: 'translateX(0%)' }, { transform: 'translateX(calc(-100% + 66px))' }], { duration: 500, easing: 'ease', fill: 'forwards' });
			});
			document.querySelector('.game-summary')?.classList.remove('hidden');
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
			const timerElement = document.querySelector('.timer') as HTMLElement;
			timerElement!.innerHTML = `Time: ${Math.floor(timePassed)}.<small>${timePassed.toString().split('.')[1]}</small>s`
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
		const sidebarWidth = document.querySelector('.sidebar')?.getBoundingClientRect().width;
		document.querySelector(".start-screen-content")?.classList.toggle("hidden");
		document.querySelector(".game-screen-content")?.classList.toggle("hidden");
		document.querySelector(".sidebar")?.animate([{ transform: 'translateX(calc(-100% + 66px))' }, { transform: 'translateX(0%)' }], { duration: 500, easing: 'ease', fill: 'forwards' });
		document.querySelector('.main-screen')?.animate([{ paddingLeft: '0%' }, { paddingLeft: `${sidebarWidth}px` }], { duration: 500, easing: 'ease', fill: 'forwards' });
	};

	const switchOnLeaveUI = () => {
		document.querySelector(".game-summary")?.classList.toggle("hidden");
		document.querySelector(".start-screen-content")?.classList.toggle("hidden");
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

	const onLeaveLobby = () => {
		socket.emit('leaveLobby', lobbyName);
		setLobbyPlayers([]);
		switchOnLeaveUI();
	};

	return (
		<div className="main">
			<Sidebar players={lobbyPlayers} gainNodeRef={gainNodeRef} />
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
					<h2 className='timer hidden'>Time: 0s</h2>
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
				<GameSummary players={lobbyPlayers} onLeaveLobby={onLeaveLobby} />
				<footer>Borys Gajewki & Mateusz Antkiewicz @ 2025</footer>
			</div>
		</div>
	);
}

export default App;
