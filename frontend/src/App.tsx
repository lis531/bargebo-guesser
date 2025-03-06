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
	const [songs, setSongs] = useState<{ id: string; title: string; artist: string; cover: string; }[]>([]);

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
    const onSongSelection = (song: { id: string; title: string; artist: string }) => {
        setSelectedSong(song);
        console.log("Selected song:", song);
    };

	const token = 'BQAO85Coe1l6mSGJf8v3-6plBfGmcTTcjkKXK3CpWAiE7SggSsk6ZSge0j_taSp2xv7EFz9OAH3KPpj-EytASvWsMamPazWjz3f-KbYb4_MACZAGelMk96G7SQl6zsd0LAFdMIcdN7SwDeJw_z4WXGsQ7t4qB5FOSAgHCf2pFehd4njv5zP9Q-E-azJT1Q-f0X4Dud92Z620f289f97y8N0STFHsKdO8s5Q7YgNPKS0pIZ_f44cqPhrsBaLzQd6p9z8zTOx3wduYPQT8UziPO6tdrOE9pK9AAbmC8Ul5N9nEghk8qAsCrMSKppQU';

	interface Artist {
	  name: string;
	}
	
	interface Track {
	  album: any;
	  name: string;
	  artists: Artist[];
	  popularity: number;
	}
	
	async function fetchWebApi(endpoint: string, method: string, body?: any) {
	  const res = await fetch(`https://api.spotify.com/${endpoint}`, {
		headers: {
		  Authorization: `Bearer ${token}`,
		},
		method,
		body: body ? JSON.stringify(body) : undefined,
	  });
	  return await res.json();
	}
	
	async function getPopularTracks(): Promise<Track[]> {
	  const data = await fetchWebApi(
		'v1/search?q=track&type=track&limit=50', 'GET', undefined
	  );
	  
	  const popularTracks = data.tracks.items.filter((track: Track) => track.popularity > 50);
	  
	  return popularTracks;
	}
	
	useEffect(() => {
	  const fetchTracks = async () => {
		const popularTracks = await getPopularTracks();
		
		if (popularTracks.length === 0) {
		  console.log('No tracks found with popularity > 50.');
		  return;
		}

		const selectedTracks = [];
		for (let i = 0; i < 4; i++) {
			const randomTrack = popularTracks[Math.floor(Math.random() * popularTracks.length)];
			selectedTracks.push(randomTrack);
		}
	
		setSongs(selectedTracks.map(track => ({
			id: track.name,
			title: track.name,
			artist: track.artists.map(artist => artist.name).join(', '),
			cover: track.album.images[0].url,
		})));
	  };
	
	  fetchTracks();
	}, []);

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