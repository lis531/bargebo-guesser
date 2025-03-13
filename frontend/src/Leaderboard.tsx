import './Leaderboard.css'

interface Player {
    id: number;
    username: string;
    score: number;
}

function Leaderboard(props: { players: Player[] }) {
    const { players } = props;
    return (
        <div className="leaderboard">
            <h2>Leaderboard</h2>
            <h3 id='roundNumber'>Round: </h3>
            <div className="leaderboard-players">
                {players.map((player, index) => {
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