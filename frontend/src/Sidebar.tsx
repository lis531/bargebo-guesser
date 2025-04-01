import './Sidebar.css'

interface Player {
    id: number;
    username: string;
    score: number;
}

interface GainNodeRef {
    current: GainNode | null;
}

function Sidebar(props: { players: Player[], gainNodeRef: GainNodeRef }) {
    const gainNodeRef = props.gainNodeRef;
    const { players } = props;
    const initialVolume = Number(localStorage.getItem('volume')) || 50;

    const toggleSettingsView = () => {
        const dialog = document.querySelector('.settings-dialog') as HTMLDialogElement;
        if (dialog) {
            dialog.showModal();
        }
    }

    const changeVolume = (volume: number) => {
        localStorage.setItem('volume', volume.toString());
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = volume / 200;
        }
    };

    return (
        <>
            <dialog className='settings-dialog' onClick={(e) => { if (e.target === e.currentTarget) { (e.currentTarget as HTMLDialogElement).close() } }}>
                <div className='settings-dialog-content'>
                    <h2>Settings</h2>
                    <input type="checkbox" id="specialEffects" name="specialEffects" value="specialEffects" />
                    <label htmlFor="specialEffects">Special Effects</label><br />
                    <select id='theme' name='theme' onChange={(e) => {
                        const theme = e.target.value;
                        localStorage.setItem('theme', theme);
                        document.documentElement.setAttribute('data-theme', theme);
                        }}>
                        <option value="system" defaultChecked>System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                    <label htmlFor="darkMode">Theme</label><br />
                </div>
            </dialog>
            <div className='sidebar'>
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
                <div className='volume'>
                    <label htmlFor="volume">Volume</label>
                    <input
                        id="volume"
                        type='range'
                        defaultValue={initialVolume}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(e) => changeVolume(parseInt(e.target.value))}
                    />
                </div>
                <button className='settings-button' title="Settings" onClick={() => { toggleSettingsView() }}>
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="30px" width="30px" xmlns="http://www.w3.org/2000/svg">
                        <path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M262.29 192.31a64 64 0 1 0 57.4 57.4 64.13 64.13 0 0 0-57.4-57.4zM416.39 256a154.34 154.34 0 0 1-1.53 20.79l45.21 35.46a10.81 10.81 0 0 1 2.45 13.75l-42.77 74a10.81 10.81 0 0 1-13.14 4.59l-44.9-18.08a16.11 16.11 0 0 0-15.17 1.75A164.48 164.48 0 0 1 325 400.8a15.94 15.94 0 0 0-8.82 12.14l-6.73 47.89a11.08 11.08 0 0 1-10.68 9.17h-85.54a11.11 11.11 0 0 1-10.69-8.87l-6.72-47.82a16.07 16.07 0 0 0-9-12.22a155.3 155.3 0 0 1-21.46-12.57 16 16 0 0 0-15.11-1.71l-44.89 18.07a10.81 10.81 0 0 1-13.14-4.58l-42.77-74a10.8 10.8 0 0 1 2.45-13.75l38.21-30a16.05 16.05 0 0 0 6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 0 0-6.07-13.94l-38.19-30A10.81 10.81 0 0 1 49.48 186l42.77-74a10.81 10.81 0 0 1 13.14-4.59l44.9 18.08a16.11 16.11 0 0 0 15.17-1.75A164.48 164.48 0 0 1 187 111.2a15.94 15.94 0 0 0 8.82-12.14l6.73-47.89A11.08 11.08 0 0 1 213.23 42h85.54a11.11 11.11 0 0 1 10.69 8.87l6.72 47.82a16.07 16.07 0 0 0 9 12.22a155.3 155.3 0 0 1 21.46 12.57 16 16 0 0 0 15.11 1.71l44.89-18.07a10.81 10.81 0 0 1 13.14 4.58l42.77 74a10.8 10.8 0 0 1-2.45 13.75l-38.21 30a16.05 16.05 0 0 0-6.05 14.08c.33 4.14.55 8.3.55 12.47z"></path>
                    </svg>
                </button>
            </div>
        </>
    );
};

export default Sidebar;