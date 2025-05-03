import { useRef, useEffect, useState } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import Sidebar from './Sidebar.tsx';
import GameSummary from './GameSummary.tsx';
import { io } from "socket.io-client";

// const socket = io("http://localhost:2137/");
const socket = io("https://bargebo-00fc4919d1db.herokuapp.com/");

type Player = {
	id: string;
	username: string;
	choice: number;
	score: number;
	isHost?: boolean;
};

type Lobby = {
	players: Player[];
	roundStarted: boolean;
	currentRound: number;
	rounds: number;
};

type LobbyMap = Record<string, Lobby>;

function App() {
	const [lobbyName, setLobbyName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [lobbyPlayers, setLobbyPlayers] = useState<Player[]>([]);
	const [previousPlayers, setPreviousPlayers] = useState<Player[]>([]);
	const [lobbyList, setLobbyList] = useState<LobbyMap>({});
	const [songs, setSongs] = useState<{ title: string; artist: string; cover: string; url: string; }[]>([]);
	const [correctSongIndex, setCorrectSongIndex] = useState<number>();
	const [gameEnded, setGameEnded] = useState<boolean>(false);
	const [host, setHost] = useState<string>("");
	const [finalPlayers, setFinalPlayers] = useState<Player[]>([]);
	const [lastConnectedLobby, setLastConnectedLobby] = useState<string>("");
	const gameModeOptions = {
		normal: "Normal",
		// stayAlive: "Stay alive",
		firstToAnswer: "First to answer",
		ultraInstinct: "Ultra instinct"
	} as { [key: string]: string };
	const [currentMode, setCurrentMode] = useState<string>("normal");
	const [minScore, setMinScore] = useState<number>(0);
	const [roundDuration, setRoundDuration] = useState<number>(20);

	const audioContextRef = useRef<AudioContext | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const sourceAudioBufferRef = useRef<AudioBufferSourceNode | null>(null);

	const timerRef = useRef<HTMLHeadingElement>(null);
	const hostControlsRef = useRef<HTMLDivElement>(null);
	const songPickerRef = useRef<HTMLDivElement>(null);
	const gameScreenContentRef = useRef<HTMLDivElement>(null);
	const startScreenContentRef = useRef<HTMLDivElement>(null);
	const lobbiesListRef = useRef<HTMLDivElement>(null);
	const mainScreenRef = useRef<HTMLDivElement>(null);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const gameSummaryRef = useRef<HTMLDivElement>(null);
	const ssfeedbackRef = useRef<HTMLParagraphElement>(null);
	const gsfeedbackRef = useRef<HTMLParagraphElement>(null);
	const roundSummaryRef = useRef<HTMLDivElement>(null);
	const summaryListRef = useRef<HTMLOListElement>(null);
	const progressBarRef = useRef<HTMLDivElement>(null);
	const lobbyPlayersRef = useRef<Player[]>([]);
	const previousPlayersRef = useRef<Player[]>([]);

	// const [isDevMode, _] = useState<boolean>(localStorage.getItem('devMode') === 'true');

	useEffect(() => {
		audioContextRef.current = new AudioContext();
		gainNodeRef.current = audioContextRef.current.createGain();
		gainNodeRef.current.gain.value = localStorage.getItem('volume') ? Number(localStorage.getItem('volume')) / 200 : 0.25;
		gainNodeRef.current.connect(audioContextRef.current.destination);

		const handleLobbyListChange = (lobbies: LobbyMap) => {
			setLobbyList(lobbies);
		}

		const handlePlayersChange = (players: Player[]) => {
			setLobbyPlayers(players);
			if (lobbyPlayersRef.current.length > players.length) {
				const leftPlayer = lobbyPlayersRef.current.find(player => !players.some(p => p.id === player.id));
				if (leftPlayer) {
					setPreviousPlayers(prev => prev.filter(p => p.id !== leftPlayer.id));
				}
			} else if (lobbyPlayersRef.current.length < players.length) {
				const newPlayer = players.find(player => !lobbyPlayersRef.current.some(p => p.id === player.id));
				if (newPlayer) {
					setPreviousPlayers(prev => [...prev, newPlayer]);
				}
			}
			setHost(players.find((player: Player) => player.isHost)?.username || "");
		};

		socket.on('onLobbyListChanged', handleLobbyListChange);
		socket.on('onPlayersChanged', handlePlayersChange);

		socket.on("createLobbyResponse", (_, err) => {
			if (err !== '') {
				ssfeedbackRef.current!.innerText = err;
				return;
			}
			switchGameUI();
			hostControlsRef.current?.classList.remove("invisible");
			timerRef.current?.classList.add('invisible');
			songPickerRef.current?.classList.add('invisible');
		});

		socket.on("joinLobbyResponse", (err) => {
			if (err !== '') {
				ssfeedbackRef.current!.innerText = err;
				return;
			}
			switchGameUI();
			timerRef.current?.classList.add('hidden');
			songPickerRef.current?.classList.add('hidden');
		});

		socket.on('onGameStart', () => {
			setGameEnded(false);
			hostControlsRef.current?.classList.add('invisible');
		});

		socket.on('onRoundStart', async (allSongs, correctIndex, correctSongData, currentRounds, rounds, roundCurrentTimestamp, minScore) => {
			setMinScore(minScore);
			if (!previousPlayersRef.current.length) {
				setPreviousPlayers(lobbyPlayersRef.current);
			}
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}

			if (timerRef.current?.classList.contains('hidden')) {
				timerRef.current?.classList.remove('hidden');
			}
			if (songPickerRef.current?.classList.contains('hidden')) {
				songPickerRef.current?.classList.remove('hidden');
			}

			resetSongSelection();
			setCorrectSongIndex(correctIndex);
			setSongs(allSongs);

			roundSummaryRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(30%)', opacity: 0 }], { duration: 100, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				roundSummaryRef.current?.classList.add('hidden');
				gameScreenContentRef.current?.classList.remove('hidden');
				gameScreenContentRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
				const roundNumber = document.getElementById('roundNumber') as HTMLElement;
				roundNumber.innerHTML = `Round: ${currentRounds} / ${rounds}`;
				timerRef.current?.classList.remove('invisible');
				if (songPickerRef.current?.classList.contains('invisible')) {
					songPickerRef.current?.classList.remove('invisible');
					songPickerRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
				}

				audioContextRef.current!.decodeAudioData(correctSongData, (buffer) => {
					if (sourceAudioBufferRef.current) {
						sourceAudioBufferRef.current.stop();
						sourceAudioBufferRef.current.disconnect();
						sourceAudioBufferRef.current = null;
					}
					sourceAudioBufferRef.current = audioContextRef.current!.createBufferSource();
					sourceAudioBufferRef.current.connect(gainNodeRef.current!);
					sourceAudioBufferRef.current.buffer = buffer;
					let offsetSeconds = (Date.now() - serverClientTimeOffset - roundCurrentTimestamp) / 1000;
					if (offsetSeconds < 0) {
						offsetSeconds = 0;
					}
					sourceAudioBufferRef.current.start(0, offsetSeconds);
					timerCountdown(roundCurrentTimestamp, serverClientTimeOffset);
				}, (err) => {
					console.log("Playback error: " + err);
				});
			});
		});

		socket.on('onGameEnd', async (finalPlayers) => {
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			roundSummaryRef.current?.classList.add('hidden');
			gameScreenContentRef.current?.classList.add('hidden');
			songPickerRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
				songPickerRef.current?.classList.add('hidden');
				mainScreenRef.current?.animate([{ marginLeft: `${sidebarWidth}px` }, { marginLeft: '0%' }], { duration: 400, easing: 'ease', fill: 'forwards' });
				sidebarRef.current?.classList.remove('open');
				sidebarRef.current?.animate([{ transform: 'translateX(0%)' }, { transform: 'translateX(calc(-100% + 66px))' }], { duration: 400, easing: 'ease', fill: 'forwards' });
				sidebarRef.current?.children[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' }).finished.then(() => {
					setGameEnded(true);
					const roundNumber = document.getElementById('roundNumber') as HTMLElement;
					roundNumber.innerHTML = "Round: - / -";
				});
			});
			setFinalPlayers(finalPlayers);
			gameSummaryRef.current?.classList.remove('hidden');
			gameSummaryRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
		});

		socket.on('onRoundEnd', () => {
			clearInterval((window as any).bargeboTimerInterval);
			progressBarRef.current!.style.width = "100%";
			console.log("here");
			setTimeout(() => {
				console.log("there");
				progressBarRef.current?.classList.add('right');
				progressBarRef.current!.animate([{ width: "100%" }, { width: "0%" }], { duration: 4000, easing: 'linear', fill: 'none' }).finished.then(() => {
					progressBarRef.current!.style.width = "0%";
				});
			}, 800);

			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			songPickerRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				songPickerRef.current?.classList.add('invisible');
			});
			gameScreenContentRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				gameScreenContentRef.current?.classList.add('hidden');
				roundSummaryRef.current?.classList.remove('hidden');
				roundSummaryRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' }).finished.then(() => {
					animatePlayerMoves();
				});
			});
		});

		socket.on('stopAudio', () => {
			console.log("stopAudio");
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
			}
			if (timerRef.current) {
				timerRef.current.innerHTML = "Time: 1s";
				clearInterval((window as any).bargeboTimerInterval);
			}
		});

		let serverClientTimeOffset = 0;

		socket.on('pingForOffset', (serverTime: number) => {
			const clientNow = Date.now();
			serverClientTimeOffset = clientNow - serverTime;
		});

		return () => {
			socket.off('onLobbyListChanged', handleLobbyListChange);
			socket.off('onPlayersChanged', handlePlayersChange);
			socket.off('createLobbyResponse');
			socket.off('joinLobbyResponse');
			socket.off('onGameStart');
			socket.off('onRoundStart');
			socket.off('onGameEnd');
			socket.off('onRoundEnd');
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, []);

	useEffect(() => {
		lobbyPlayersRef.current = lobbyPlayers;
	}, [lobbyPlayers]);

	useEffect(() => {
		previousPlayersRef.current = previousPlayers;
	}, [previousPlayers]);

	const timerCountdown = (roundStartTimestamp: number, serverClientTimeOffset: number) => {
		if (!timerRef.current) return;
		if ((window as any).bargeboTimerInterval) clearInterval((window as any).bargeboTimerInterval);

		progressBarRef.current?.classList.remove('right');
		function updateTimer() {
			if (!timerRef.current || gameEnded) return;

			let elapsed = Date.now() - serverClientTimeOffset - roundStartTimestamp;
			if (elapsed < 0) elapsed = 0;
			if (elapsed > roundDuration * 1000) elapsed = roundDuration * 1000;

			const intPart = Math.floor(elapsed / 1000);
			const decPart = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
			timerRef.current.innerHTML = `Time: ${intPart}.<small>${decPart}</small>s`;
			progressBarRef.current!.style.width = `${(elapsed / 1000 / roundDuration) * 100}%`;

			if (elapsed >= roundDuration * 1000) {
				timerRef.current.innerHTML = `Time: ${roundDuration}s`;
				clearInterval((window as any).bargeboTimerInterval);
			}
		}

		updateTimer();
		(window as any).bargeboTimerInterval = setInterval(updateTimer, 10);
		return () => clearInterval((window as any).bargeboTimerInterval);
	};

	const switchGameUI = () => {
		const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
		startScreenContentRef.current?.classList.toggle("hidden");
		lobbiesListRef.current?.classList.toggle("hidden");
		gameScreenContentRef.current?.classList.toggle("hidden");
		sidebarRef.current?.classList.add("open");
		sidebarRef.current?.animate([{ transform: 'translateX(calc(-100% + 66px))' }, { transform: 'translateX(0%)' }], { duration: 400, easing: 'ease', fill: 'forwards' });
		sidebarRef.current?.children[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
		mainScreenRef.current?.animate([{ marginLeft: '0%' }, { marginLeft: `${sidebarWidth}px` }], { duration: 400, easing: 'ease', fill: 'forwards' });
	};

	const switchOnLeaveUI = () => {
		if (lobbyPlayers.some(player => player.username === username && player.isHost)) {
			socket.emit("leaveLobby");
		}
		gameSummaryRef.current?.classList.add("hidden");
		roundSummaryRef.current?.classList.add("hidden");
		songPickerRef.current?.classList.add("invisible");
		songPickerRef.current?.classList.add("hidden");
		timerRef.current?.classList.add("hidden");
		gameScreenContentRef.current?.classList.add("hidden");
		timerRef.current?.classList.add("hidden");
		hostControlsRef.current?.classList.add("invisible");
		startScreenContentRef.current?.classList.remove("hidden");
		lobbiesListRef.current?.classList.remove("hidden");
		if (sidebarRef.current?.classList.contains("open")) {
			sidebarRef.current?.classList.remove("open");
			const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
			sidebarRef.current?.animate([{ transform: 'translateX(0%)' }, { transform: 'translateX(calc(-100% + 66px))' }], { duration: 400, easing: 'ease', fill: 'forwards' });
			sidebarRef.current?.children[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' });
			mainScreenRef.current?.animate([{ marginLeft: `${sidebarWidth}px` }, { marginLeft: '0%' }], { duration: 400, easing: 'ease', fill: 'forwards' });
			startScreenContentRef.current?.animate([{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 300, easing: 'ease', fill: 'forwards' });
			lobbiesListRef.current?.animate([{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 300, easing: 'ease', fill: 'forwards' });
		}
	};

	const createLobby = () => {
		if (lobbyName && username) {
			setLastConnectedLobby(lobbyName);
			socket.emit("createLobby", lobbyName, username);
		} else {
			ssfeedbackRef.current!.innerText = "Please enter a username and lobby name.";
		}
	};

	const joinLobby = (lobby = lobbyName) => {
		if (lobby && username) {
			setLastConnectedLobby(lobby);
			socket.emit("joinLobby", lobby, username);
		} else {
			ssfeedbackRef.current!.innerText = "Please enter a username and lobby name.";
		}
	};

	const reconnectLobby = (lobby = lobbyName) => {
		if (lobby && username) {
			socket.emit("reconnectLobby", lobby, username);
		}
	};

	const startGame = () => {
		if (lobbyPlayers.some(player => player.username === username && player.isHost)) {
			const rounds = parseInt((document.getElementById('rounds') as HTMLInputElement).value);
			const gameMode = currentMode;
			if (gameMode === "ultraInstinct") {
				setRoundDuration(5);
			}
			const podiumBonusScore = (document.getElementById('podiumBonusScore') as HTMLInputElement).checked;
			if (!(gameMode in gameModeOptions)) {
				gsfeedbackRef.current!.innerText = "Invalid mode.";
				return;
			} else if (roundDuration < 5 || roundDuration > 30 || isNaN(roundDuration)) {
				gsfeedbackRef.current!.innerText = "Invalid round duration. (5-30)";
				return;
			} else if (rounds < 1 || rounds > 30 || isNaN(rounds)) {
				gsfeedbackRef.current!.innerText = "Invalid number of rounds. (1-30)";
				return;
			} else {
				gsfeedbackRef.current!.innerText = "";
			}
			socket.emit('announceGameStart', lobbyName, rounds, gameMode, roundDuration, podiumBonusScore);
		} else {
			gsfeedbackRef.current!.innerText = "You are not the host.";
		}
	};

	const submitAnswer = (choiceIndex: number) => {
		socket.emit('submitAnswer', choiceIndex);
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
		socket.emit("leaveLobby");
		setLobbyPlayers([]);
		audioContextRef.current?.close();
		audioContextRef.current = new AudioContext();
		gainNodeRef.current = audioContextRef.current.createGain();
		gainNodeRef.current.gain.value = localStorage.getItem('volume') ? Number(localStorage.getItem('volume')) / 200 : 0.25;
		gainNodeRef.current.connect(audioContextRef.current.destination);
		switchOnLeaveUI();
	};

	const onLobbyReturn = () => {
		gameSummaryRef.current?.classList.add('hidden');
		timerRef.current?.classList.add('invisible');
		gameScreenContentRef.current?.classList.remove('hidden');
		songPickerRef.current?.classList.add('invisible');
		sidebarRef.current?.classList.add('open');
		const sidebarWidth = sidebarRef.current?.getBoundingClientRect().width;
		mainScreenRef.current?.animate([{ marginLeft: '0%' }, { marginLeft: `${sidebarWidth}px` }], { duration: 400, easing: 'ease', fill: 'forwards' });
		sidebarRef.current?.animate([{ transform: 'translateX(calc(-100% + 66px))' }, { transform: 'translateX(0%)' }], { duration: 400, easing: 'ease', fill: 'forwards' });
		sidebarRef.current?.children[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
		if (lobbyPlayers.some(player => player.username === username && player.isHost)) {
			hostControlsRef.current?.classList.remove("invisible");
		} else {
			reconnectLobby(lastConnectedLobby);
		}
	};

	const animatePlayerMoves = () => {
		lobbyPlayersRef.current.map((player, index) => {
			const prevPlayerIndex = previousPlayersRef.current.findIndex(prevPlayer => prevPlayer.id === player.id);
			if (prevPlayerIndex !== -1) {
				const diffPosition = prevPlayerIndex - index;
				const playersList = summaryListRef.current!.children as HTMLCollectionOf<HTMLOListElement>;
				const liHeight = 73;
				const newPlayerPosition = diffPosition * liHeight;
				playersList[index].style.transition = "transform 1s ease-in-out, color 1s ease-in-out";
				playersList[index].style.transform = `translateY(${newPlayerPosition}px)`;
				const prevScore = previousPlayersRef.current[prevPlayerIndex]?.score ?? 0;
				const newScore = player.score;
				if (newScore > prevScore) {
					const scoreElem = playersList[prevPlayerIndex].querySelector("p:nth-child(2)") as HTMLParagraphElement;
					const start = performance.now(), duration = 500, diffScore = newScore - prevScore;

					requestAnimationFrame(function animate(t) {
						const progress = Math.min((t - start) / duration, 1);
						scoreElem.textContent = "Score: " + Math.floor(prevScore + diffScore * progress).toString();
						if (progress < 1) requestAnimationFrame(animate);
					});
				}
				if (diffPosition === 0) {
					setTimeout(() => {
						setPreviousPlayers(lobbyPlayersRef.current);
					}, 1500);
					return;
				}
				playersList[index].style.color = diffPosition < 0 ? "var(--correct-color)" : "var(--incorrect-color)";
				setTimeout(() => {
					playersList[index].style.transition = "none";
					playersList[index].style.transform = `translateY(0px)`;
					playersList[index].style.color = "var(--text-color)";
					setPreviousPlayers(lobbyPlayersRef.current);
				}, 1500);
			}
		});
	};

	return (
		<div className="main">
			<Sidebar players={lobbyPlayers} gainNodeRef={gainNodeRef} sidebarRef={sidebarRef} gameEnded={gameEnded} yourUsername={username} host={host} onLeaveLobby={onLeaveLobby} gameMode={currentMode} minScore={minScore} />
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
						<p id='ssfeedback' className='error' ref={ssfeedbackRef}></p>
					</div>
					<div className='start-screen-buttons'>
						<button type="submit" onClick={() => joinLobby()}>Join Lobby</button>
						<button type="submit" onClick={() => createLobby()}>Create Lobby</button>
					</div>
				</div>
				<div className='lobbies-list' ref={lobbiesListRef}>
					{Object.keys(lobbyList).length > 0 ? (
						<h2>Available lobbies:</h2>
					) : null}
					<ul id='lobbiesList'>
						{Object.entries(lobbyList).map(([lobbyName, lobby]) => {
							if (!lobby.players) return null;
							return (
								<li key={lobbyName}>
									<h2>{lobbyName}</h2>
									<p>Players: {lobby.players.length}</p>
									<p>Round: {lobby.currentRound == 0 ? "-" : lobby.currentRound} / {lobby.rounds == 0 ? "-" : lobby.rounds}</p>
									<p>Status: {lobby.roundStarted ? "In Progress" : "Waiting"}</p>
									<button className='join-lobby-button' onClick={() => joinLobby(lobbyName)} title={`Join ${lobbyName} lobby`}>
										<svg stroke="var(--correct-color)" fill="var(--correct-color)" strokeWidth="0" viewBox="0 0 448 512" height="30px" width="30px" xmlns="http://www.w3.org/2000/svg"><path d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"></path></svg>
									</button>
								</li>
							)
						})}
					</ul>
				</div>
				<div className='game-screen-content hidden' ref={gameScreenContentRef}>
					<h2 className='timer hidden invisible' ref={timerRef}></h2>
					<div className='host-controls invisible' ref={hostControlsRef}>
						<label htmlFor='rounds'>Number of rounds:</label>
						<input id='rounds' type="number" min={1} max={30} placeholder="Number of rounds" />
						<label htmlFor='gameMode'>Game mode:</label>
						<div className='gameMode' id='gameMode'>
							<div className='gameModeSelected' tabIndex={0} onFocus={() => {
								document.querySelector('.gameModeOptions')?.classList.add('gameModeOptionsVisible');
							}} onBlur={() => {
								document.querySelector('.gameModeOptions')?.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-0.5em)" }], { duration: 150, easing: 'ease', fill: 'auto' }).finished.then(() => {
									document.querySelector('.gameModeOptions')?.classList.remove('gameModeOptionsVisible');
								})
							}}>
								<span id='selectedGameMode'>{gameModeOptions[currentMode]}</span>
								<svg className='dropdownIcon' stroke="var(--text-color)" fill="var(--text-color)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
									<path d="M7 10l5 5 5-5z"></path>
								</svg>
							</div>
							<div className='gameModeOptions'>
								{Object.entries(gameModeOptions).map(([key, value]) => {
									if (key === currentMode) return null;
									return (
										<div key={key} className='gameModeOption' onClick={() => { setCurrentMode(key); console.log(key); }}>
											{value}
										</div>
									)
								})}
							</div>
						</div>
						{currentMode !== "ultraInstinct" ? (
							<>
								<label htmlFor='roundDuration'>Round duration:</label>
								<input id='roundDuration' type="number" min={5} max={30} defaultValue={20} placeholder="Round duration" onChange={(e) => setRoundDuration(parseInt(e.target.value))} />
							</>
						) : null}
						<div className="inline-form-group">
							<label htmlFor="podiumBonusScore">Podium bonus score:</label>
							<input id="podiumBonusScore" type="checkbox" />
						</div>
						<p id='gsfeedback' className='error' ref={gsfeedbackRef}></p>
						<button className='submitButton' type="submit" onClick={startGame}>Start</button>
					</div>
				</div>
				<div className='round-summary hidden' ref={roundSummaryRef}>
					{correctSongIndex !== undefined && songs[correctSongIndex] ? (
						<h3>Correct Song: {songs[correctSongIndex].title} - {songs[correctSongIndex].artist}</h3>
					) : null}
					<ol className='summary-list' ref={summaryListRef}>
						{previousPlayers.map(player => (
							<li key={player.id}>
								<p>{player.username}</p><p>Score: {player.score}</p>
							</li>
						))}
					</ol>
				</div>
				<SongPicker songs={songs} onSongSelect={onSongSelection} ref={songPickerRef} />
				<GameSummary players={finalPlayers} onLeaveLobby={switchOnLeaveUI} onLobbyReturn={onLobbyReturn} ref={gameSummaryRef} lobbyStillExists={Object.keys(lobbyList).some(lobby => lobby === lastConnectedLobby) ? true : false} />
				<footer>Borys Gajewski & Mateusz Antkiewicz @ 2025</footer>
				<div className='progress-bar' ref={progressBarRef}></div>
			</div>
		</div>
	);
}

export default App;
