import { useState, useEffect } from 'react'
import './App.css'

import { io } from "socket.io-client";

const socket = io("http://130.162.248.218:2137");

function App() {
	const [lobbyName, setLobbyName] = useState<string>("")
	const [username, setUsername] = useState<string>("")
	const [lobbies, setLobbies] = useState([]);
	const [currentLobby, setCurrentLobby] = useState("");

	useEffect(() => {
		socket.on('lobbyList', (lobbies) => {
			setLobbies(lobbies);
		});

		socket.on("lobbyCreated", (lobby) => {
			setCurrentLobby(lobby);
		});

		socket.on("lobbyJoined", (players) => {
			console.log("Players in lobby:", players);
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
			setCurrentLobby(lobbyName);
		}
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " ") {
				console.log(lobbies);
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [lobbies]);

	return (
		<div className="start-screen">
			<h1>BARGEBO GUESSER</h1>
			<div>
				<div className='start-screen-inputs'>
					<input placeholder="username" name="usernameInput" value={username} onChange={(e) => setUsername(e.target.value)} type="text" className="p-2 border" />
					<input placeholder="lobby name" name="lobbyInput" value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} type="text" className="p-2 border" />
				</div>
				<div className='start-screen-buttons'>
					<button type="submit" onClick={() => joinLobby()}>Join Lobby</button>
					<button type="submit" onClick={() => createLobby()}>Create Lobby</button>
				</div>
			</div>
		</div>
	)
}

export default App
