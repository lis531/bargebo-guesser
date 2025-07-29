import { useRef, useEffect, useState } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import Sidebar from './Sidebar.tsx';
import GameSummary from './GameSummary.tsx';
import HostControls from './HostControls.tsx';
import LobbiesList from './LobbiesList.tsx';
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
	const [artists, setArtists] = useState<string[]>([]);
	const [filteredArtists, setFilteredArtists] = useState<string[]>([]);
	const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
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
	const [rounds, setRounds] = useState<number>(0);
	const [currentRound, setCurrentRound] = useState<number>(0);
	
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
	const roundDurationRef = useRef(roundDuration);
	const progressBarRef = useRef<HTMLDivElement>(null);
	const lobbyPlayersRef = useRef<Player[]>([]);
	const previousPlayersRef = useRef<Player[]>([]);
	const passwordDialog = useRef<HTMLDialogElement>(null);

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
			if (previousPlayersRef.current.length === 0) {
				setPreviousPlayers(players);
			} else if (lobbyPlayersRef.current.length > players.length) {
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

		socket.on("createLobbyResponse", (_, err, artists) => {
			if (err !== '') {
				ssfeedbackRef.current!.innerText = err;
				return;
			}
			switchGameUI();
			hostControlsRef.current?.classList.remove("invisible");
			timerRef.current?.classList.add('invisible');
			songPickerRef.current?.classList.add('invisible');
			if (artists) {
				setArtists(artists);
				setFilteredArtists(artists);
			}
		});

		socket.on("joinLobbyResponse", (err, rounds, roundDuration) => {
			if (err !== '') {
				ssfeedbackRef.current!.innerText = err;
				return;
			}
			switchGameUI();
			timerRef.current?.classList.add('hidden');
			songPickerRef.current?.classList.add('hidden');
			setRoundDuration(roundDuration);
			setRounds(rounds);
		});

		socket.on('onGameStart', (roundDuration, rounds) => {
			setGameEnded(false);
			setRoundDuration(roundDuration);
			setRounds(rounds);
			hostControlsRef.current?.classList.add('invisible');
		});

		socket.on('onGameStartResponse', (err) => {
			gsfeedbackRef.current!.innerText = err;
		});

		socket.on('onRoundStart', async (allSongs, correctIndex, correctSongData, currentRound, roundCurrentTimestamp, minScore) => {
			setMinScore(minScore);
			setCurrentRound(currentRound);
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
					timerCountdown(roundCurrentTimestamp, serverClientTimeOffset, roundDurationRef.current!);
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

			clearInterval((window as any).bargeboTimerInterval);
			progressBarRef.current!.style.width = "100%";
			setTimeout(() => {
				progressBarRef.current?.classList.add('right');
				progressBarRef.current!.animate([{ width: "100%" }, { width: "0%" }], { duration: 1000, easing: 'linear', fill: 'none' }).finished.then(() => {
					progressBarRef.current!.style.width = "0%";
				});
			}, 500);
			
			songPickerRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				songPickerRef.current?.classList.add('invisible');
			});
			gameScreenContentRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(() => {
				gameScreenContentRef.current?.classList.add('hidden');
				roundSummaryRef.current?.classList.remove('hidden');
				roundSummaryRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' }).finished.then(() => {
					animatePlayerMoves();
					setTimeout(() => {
						roundSummaryRef.current?.animate([{ transform: 'translateY(0%)', opacity: 1 }, { transform: 'translateY(30%)', opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(() => {
							roundSummaryRef.current?.classList.add('hidden');
							sidebarRef.current?.classList.remove('open');
							sidebarRef.current?.children[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' }).finished.then(() => {
								setGameEnded(true);
								setFinalPlayers(finalPlayers);
								gameSummaryRef.current?.classList.remove('hidden');
								gameSummaryRef.current?.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0%)', opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
							});
						});
					}, 1500);
				});
			});
		});

		socket.on('onRoundEnd', () => {
			clearInterval((window as any).bargeboTimerInterval);
			progressBarRef.current!.style.width = "100%";
			setTimeout(() => {
				progressBarRef.current?.classList.add('right');
				progressBarRef.current!.animate([{ width: "100%" }, { width: "0%" }], { duration: 4000, easing: 'linear', fill: 'none' }).finished.then(() => {
					progressBarRef.current!.style.width = "0%";
				});
			}, 1000);

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
			if (sourceAudioBufferRef.current) {
				sourceAudioBufferRef.current.stop();
				sourceAudioBufferRef.current = null;
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
			socket.off('stopAudio');
			socket.off('pingForOffset');
			
			clearInterval((window as any).bargeboTimerInterval);
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

	useEffect(() => {
		roundDurationRef.current = roundDuration;
	}, [roundDuration]);

	useEffect(() => {
		setFilteredArtists(prevFilteredArtists => {
			const sortedArtists = [...prevFilteredArtists].sort((a, b) => {
				if (selectedArtists.includes(a) && !selectedArtists.includes(b)) return -1;
				if (!selectedArtists.includes(a) && selectedArtists.includes(b)) return 1;
				return 0;
			});
			return sortedArtists;
		});
	}, [selectedArtists]);

	const timerCountdown = (roundStartTimestamp: number, serverClientTimeOffset: number, roundDuration: number) => {
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
			progressBarRef.current!.style.width = `${(elapsed / 1000 / roundDuration) * 101}%`;

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
		startScreenContentRef.current?.classList.toggle("hidden");
		lobbiesListRef.current?.classList.toggle("hidden");
		gameScreenContentRef.current?.classList.toggle("hidden");
		sidebarRef.current?.classList.add("open");
		sidebarRef.current?.children[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease', fill: 'forwards' });
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
			sidebarRef.current?.children[0].animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease', fill: 'forwards' });
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
			socket.emit('announceGameStart', lobbyName, rounds, gameMode, roundDuration, podiumBonusScore, selectedArtists);
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
			<Sidebar players={lobbyPlayers} gainNodeRef={gainNodeRef} sidebarRef={sidebarRef} gameEnded={gameEnded} rounds={rounds} currentRound={currentRound} yourUsername={username} host={host} onLeaveLobby={onLeaveLobby} gameMode={currentMode} minScore={minScore} />
			<div className="main-screen" ref={mainScreenRef}>
				<dialog className='passwordDialog' ref={passwordDialog}></dialog>
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
				<LobbiesList joinLobby={joinLobby} socket={socket} lobbiesListRef={lobbiesListRef}/>
				<div className='game-screen-content hidden' ref={gameScreenContentRef}>
					<h2 className='timer hidden invisible' ref={timerRef}></h2>
					<HostControls gameMode={currentMode} setGameMode={setCurrentMode} roundDuration={roundDuration} setRoundDuration={setRoundDuration} artists={artists} setArtists={setArtists} filteredArtists={filteredArtists} setFilteredArtists={setFilteredArtists} selectedArtists={selectedArtists} setSelectedArtists={setSelectedArtists} startGame={startGame} hostControlsRef={hostControlsRef} setCurrentMode={setCurrentMode} gsfeedbackRef={gsfeedbackRef}/>
				</div>
				<div className='round-summary hidden' ref={roundSummaryRef}>
					{correctSongIndex !== undefined && songs[correctSongIndex].title && songs[correctSongIndex].artist ? (
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
				<footer>Borys Gajewski & Mateusz Antkiewicz @ {new Date().getFullYear()}</footer>
				<div className='progress-bar' ref={progressBarRef}></div>
			</div>
		</div>
	);
}

export default App;
