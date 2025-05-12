import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import './LobbiesList.css';

interface Lobby {
    players: string[];
    currentRound: number;
    rounds: number;
    roundStarted: boolean;
}

function LobbiesList({ joinLobby, socket, lobbiesListRef }: { joinLobby: (lobbyName: string) => void; socket: Socket; lobbiesListRef: React.RefObject<HTMLDivElement | null> }) {
    const [lobbyList, setLobbyList] = useState<{ [key: string]: Lobby }>({});
    
    useEffect(() => {
        socket.on('onLobbyListChanged', (lobbies: { [key: string]: Lobby }) => {
            setLobbyList(lobbies);
        });

        return () => {
            socket.off('lobbyList');
        };
    }, [socket]);
    return (
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
    );
}

export default LobbiesList;