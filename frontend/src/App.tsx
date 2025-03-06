import { useState, useEffect } from 'react';
import './App.css';
import SongPicker from './SongPicker.tsx';
import { io } from "socket.io-client";

const socket = io("http://130.162.248.218:2137");

function App() {
    const [lobbyName, setLobbyName] = useState<string>("");
    const [username, setUsername] = useState<string>("");
    const [lobbies, setLobbies] = useState([]);
    const [currentLobby, setCurrentLobby] = useState("");
    const [selectedSong, setSelectedSong] = useState<{ id: string; title: string; artist: string } | null>(null);

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

    const songs = [
        { title: 'Timeless', artist: 'The Weeknd', id: '1', cover: 'https://picsum.photos/2000/2000?random=1' },
        { title: 'Chiquitita', artist: 'Abba', id: '2', cover: 'https://picsum.photos/2000/2000?random=2' },
        { title: 'Wolves', artist: 'Kanye West', id: '3', cover: 'https://picsum.photos/2000/2000?random=3' },
		{ title: 'The Box', artist: 'Roddy Ricch', id: '4', cover: 'https://picsum.photos/2000/2000?random=4' },
    ];

    const onSongSelection = (song: { id: string; title: string; artist: string }) => {
        setSelectedSong(song);
        console.log("Selected song:", song);
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
                </div>
            </div>
			<SongPicker songs={songs} onSongSelect={onSongSelection} />
		</div>
    );
}

export default App;
