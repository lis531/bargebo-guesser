import './Leaderboard.css'

interface Player {
    id: number;
    username: string;
    score: number;
}

function Leaderboard(props: { players: Player[] }) {
    const { players } = props;
    if (players.length === 0) {
        return <div></div>;
    }
    return (
        <div className="leaderboard">
            <h2>Leaderboard</h2>
            <div className="leaderboard-players">
                {players.sort((a, b) => a.score - b.score).map((player, index) => {
                    console.log(player);
                    return (
                        <div key={index} className="leaderboard-player">
                            <span>
                                <p>{index + 1}</p>
                                <p>{player.username}</p>
                            </span>
                            <p>{player.score}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Leaderboard;