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

	const timerRef = useRef<HTMLHeadingElement>(null);
	const hostControlsRef = useRef<HTMLDivElement>(null);
	const songPickerRef = useRef<HTMLDivElement>(null);
	const gameScreenContentRef = useRef<HTMLDivElement>(null);
	const startScreenContentRef = useRef<HTMLDivElement>(null);
	const mainScreenRef = useRef<HTMLDivElement>(null);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const gameSummaryRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		audioContextRef.current = new AudioContext();
		gainNodeRef.current = audioContextRef.current.createGain();
		gainNodeRef.current.gain.value = 0.25;
		gainNodeRef.current.connect(audioContextRef.current.destination);

		const handleLobbyListChange = (_lobbyNames: any[]) => {
			
		};

		const handlePlayersChange = (players: any[]) => {
			setLobbyPlayers(players);
		};

		socket.on('onLobbyListChanged', handleLobbyListChange);
		socket.on('onPlayersChanged', handlePlayersChange);

		socket.on('onPlayersChanged', (players) => {
			setLobbyPlayers(players);
		});

		socket.on("createLobbyResponse", (_lobbyName, err) => {
			if (err !== '') {
				document.getElementById('ssfeedback')!.innerHTML = err;
				return;
			}
			switchGameUI();
			hostControlsRef.current?.classList.remove("invisible");
			timerRef.current?.classList.add('invisible');
			songPickerRef.current?.classList.add('invisible');
		});

		socket.on("joinLobbyResponse", (err) => {
			if (err !== '') {
				document.getElementById('ssfeedback')!.innerHTML = err;
				return;
			}
			switchGameUI();
			timerRef.current?.classList.add('hidden');
			songPickerRef.current?.classList.add('hidden');
		});

		socket.on('onGameStart', () => {
			hostControlsRef.current?.classList.add('invisible');
			timerRef.current?.classList.remove('hidden');
			songPickerRef.current?.classList.remove('hidden');
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

			timerRef.current?.classList.remove('invisible');
			if (songPickerRef.current?.classList.contains('invisible')) {
				songPickerRef.current?.classList.remove('invisible');
				songPickerRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 500, easing: 'ease', fill: 'forwards' });
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
			gameScreenContentRef.current?.classList.add('hidden');
			songPickerRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 500, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
				songPickerRef.current?.classList.add('hidden');
				mainScreenRef.current?.animate([{ paddingLeft: `${sidebarWidth}px` }, { paddingLeft: '0%' }], { duration: 500, easing: 'ease', fill: 'forwards' });
				sidebarRef.current?.animate([{ transform: 'translateX(0%)' }, { transform: 'translateX(calc(-100% + 66px))' }], { duration: 500, easing: 'ease', fill: 'forwards' });
				sidebarRef.current?.children[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease', fill: 'forwards' });
			});
			gameSummaryRef.current?.classList.remove('hidden');
		});

		socket.on('onRoundEnd', () => {
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			socket.emit('announceRoundStart', lobbyName);
		});

		socket.on('timerChange', (timePassed) => {
			if (timerRef.current) {
				timerRef.current.innerHTML = `Time: ${Math.floor(timePassed)}.<small>${timePassed.toString().split('.')[1]}</small>s`;
			}
		});

		return () => {
			socket.off('onLobbyListChanged');
			socket.off('onPlayersChanged');
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	const switchGameUI = () => {
		const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
		startScreenContentRef.current?.classList.toggle("hidden");
		gameScreenContentRef.current?.classList.toggle("hidden");
		sidebarRef.current?.animate([{ transform: 'translateX(calc(-100% + 66px))' }, { transform: 'translateX(0%)' }], { duration: 500, easing: 'ease', fill: 'forwards' });
		sidebarRef.current?.children[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease', fill: 'forwards' });
		mainScreenRef.current?.animate([{ paddingLeft: '0%' }, { paddingLeft: `${sidebarWidth}px` }], { duration: 500, easing: 'ease', fill: 'forwards' });
	};

	const switchOnLeaveUI = () => {
		gameSummaryRef.current?.classList.toggle("hidden");
		startScreenContentRef.current?.classList.toggle("hidden");
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
		const feedbackElement = document.getElementById('gsfeedback') as HTMLElement;
		if (lobbyPlayers.some(player => player.username === username && player.isHost)) {
			const rounds = parseInt((document.getElementById('rounds') as HTMLInputElement).value);
			if (rounds < 1 || rounds > 30 || isNaN(rounds)) {
				feedbackElement.innerHTML = "Invalid number of rounds. (1-30)";
				return;
			} else {
				feedbackElement.innerHTML = "";
			}
			socket.emit('announceGameStart', lobbyName, rounds);
			socket.emit('announceRoundStart', lobbyName);
		} else {
			feedbackElement.innerHTML = "You are not the host.";
		}
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

	const onLobbyReturn = () => {
		gameSummaryRef.current?.classList.add('hidden');
		startScreenContentRef.current?.classList.remove("hidden");
		if (lobbyPlayers.some(player => player.username === username && player.isHost)) {
			hostControlsRef.current?.classList.remove("invisible");
			timerRef.current?.classList.add('invisible');
			songPickerRef.current?.classList.add('invisible');
		}
		switchGameUI();
	};

	return (
		<div className="main">
			<Sidebar players={lobbyPlayers} gainNodeRef={gainNodeRef} ref={sidebarRef} />
			<div className="main-screen" ref={mainScreenRef}>
				<h1>BARGEBO GUESSER</h1>
				<div className='start-screen-content' ref={startScreenContentRef}>
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
						<p id='ssfeedback' className='error'></p>
					</div>
					<div className='start-screen-buttons'>
						<button type="submit" onClick={joinLobby}>Join Lobby</button>
						<button type="submit" onClick={createLobby}>Create Lobby</button>
					</div>
				</div>
				<div className='game-screen-content hidden' ref={gameScreenContentRef}>
					<h2 className='timer hidden' ref={timerRef}>Time: 0s</h2>
					<div className='host-controls invisible' ref={hostControlsRef}>
						<div>
							<label>Number of rounds:</label>
							<input id='rounds' type="number" min={1} max={30} placeholder="Number of rounds" />
							<p id='gsfeedback' className='error'></p>
							<button className='submitButton' type="submit" onClick={startGame}>Start</button>
						</div>
					</div>
				</div>
				<SongPicker songs={songs} onSongSelect={onSongSelection} ref={songPickerRef} />
				<GameSummary players={lobbyPlayers} onLeaveLobby={onLeaveLobby} onLobbyReturn={onLobbyReturn} ref={gameSummaryRef} />
				<footer>Borys Gajewki & Mateusz Antkiewicz @ 2025</footer>
			</div>
		</div>
	);
}

export default App;
