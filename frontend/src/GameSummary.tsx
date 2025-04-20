import './GameSummary.css'

interface Props {
    players: {
        username: string;
        score: number;
    }[];
    onLeaveLobby: () => void;
    onLobbyReturn: () => void;
    ref: React.RefObject<HTMLDivElement | null>;
}

function GameSummary({ players, onLeaveLobby, onLobbyReturn, ref }: Props) {
    const leaveLobby = () => {
        onLeaveLobby();
    }

    const returnToLobby = () => {
        onLobbyReturn();
    }

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

    return (
        <div className="hidden game-summary" ref={ref}>
            <h2>Game Summary</h2>
            <div className="game-summary-players">
                <ol className='summary-list'>
                    {sortedPlayers.map((player, index) => (
                        <li key={index}>
                            <p>{player.username}</p><p>Score: {player.score}</p>
                        </li>
                    ))}
                </ol>
            </div>
            <div>
                <button onClick={leaveLobby}>Leave</button>
                <button onClick={returnToLobby}>Return to lobby</button>
            </div>
        </div>
    )
}

export default GameSummary;