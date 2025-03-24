import './GameSummary.css'

interface Props {
    players: {
        username: string;
        score: number;
    }[];
    onLeaveLobby: () => void;
}

function GameSummary({ players, onLeaveLobby }: Props) {
    const leaveLobby = () => {
        onLeaveLobby();
    }

    return (
        <div className="hidden game-summary">
            <h2>Game Summary</h2>
            <div className="game-summary-players">
                {players.map((player, index) => (
                    <div key={index} className="game-summary-player">
                        <p><span>{index + 1}.</span> {player.username}</p>
                        <p>Score: {player.score}</p>
                    </div>
                ))}
            </div>
            <div>
                {/* <button className="hidden">Play Again</button> */}
                <button onClick={() => leaveLobby()}>Leave</button>
            </div>
        </div>
    )
}

export default GameSummary;