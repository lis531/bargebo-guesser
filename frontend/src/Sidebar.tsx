import { useEffect, useState } from 'react';
import './Sidebar.css';

interface Player {
    id: number;
    username: string;
    score: number;
}

interface Props {
    gainNodeRef: React.RefObject<GainNode | null>;
    sidebarRef: React.RefObject<HTMLDivElement | null>;
    onLeaveLobby: () => void;
}

function Sidebar(props: { players: Player[] } & Props) {
    const gainNodeRef = props.gainNodeRef;
    const sidebarRef = props.sidebarRef;
    const onLeaveLobby = props.onLeaveLobby;
    const { players } = props;

    const initialVolume = Number(localStorage.getItem('volume')) || 50;
    const initialTheme = localStorage.getItem('theme') || 'system';
    const [theme, setTheme] = useState(initialTheme);

    const toggleSettingsView = () => {
        const dialog = document.querySelector('.settings-dialog') as HTMLDialogElement;
        if (dialog) {
            dialog.showModal();
            dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-in-out', fill: 'forwards' });
        }
    };

    const closeSettingsView = (e: React.MouseEvent) => {
        const dialog = document.querySelector('.settings-dialog') as HTMLDialogElement;
        if (dialog && e.target === dialog) {
            dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in-out', fill: 'forwards' }).finished.then(() => {
                dialog.close();
            });
        }
    };

    const changeVolume = (volume: number) => {
        localStorage.setItem('volume', volume.toString());
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = volume / 200;
        }
    };

    const handleThemeChange = (newTheme: string) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        if (localStorage.getItem('specialEffects') === null) localStorage.setItem('specialEffects', 'true');
        if (localStorage.getItem('devMode') === null) localStorage.setItem('devMode', 'false');
        (document.getElementById('specialEffects') as HTMLInputElement).checked = localStorage.getItem('specialEffects') === 'true';
        (document.getElementById('devMode') as HTMLInputElement).checked = localStorage.getItem('devMode') === 'true';
    }, [theme]);

    return (
        <>
            <dialog className='settings-dialog' onClick={(e) => closeSettingsView(e)}>
                <div className='settings-dialog-content'>
                    <h2>Settings</h2>
                    <label htmlFor="specialEffects">Special effects</label>
                    <input type="checkbox" id="specialEffects" name="specialEffects" value="specialEffects" onChange={(e) => localStorage.setItem('specialEffects', JSON.stringify(e.target.checked))} defaultChecked />
                    <br />
                    <label htmlFor="devMode">Developer mode</label>
                    <input type="checkbox" id="devMode" name="devMode" value="devMode" onChange={(e) => localStorage.setItem('devMode', JSON.stringify(e.target.checked))} />
                    <br />
                    <label htmlFor="darkMode">Theme: </label>
                    <select id="theme" name="theme" value={theme} onChange={(e) => handleThemeChange(e.target.value)}>
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </div>
            </dialog>
            <div className="sidebar" ref={sidebarRef}>
                <div className="leaderboard">
                    <h2>Leaderboard</h2>
                    <h3 id="roundNumber">Round: </h3>
                    <div className="leaderboard-players">
                        {players.map((player, index) => (
                            <div key={index} className="leaderboard-player">
                                <span>
                                    <p>{index + 1}</p>
                                    <p>{player.username}</p>
                                </span>
                                <p>{player.score}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className='sidebar-buttons'>
                    <button className='leave-button' onClick={onLeaveLobby} title="Leave Lobby">
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="30px" width="30px" xmlns="http://www.w3.org/2000/svg">
                            <path d="M215.469 332.802l29.863 29.864L352 256 245.332 149.333l-29.863 29.865 55.469 55.469H64v42.666h205.864l-54.395 55.469zM405.334 64H106.666C83.198 64 64 83.198 64 106.666V192h42.666v-85.333h298.668v298.668H106.666V320H64v85.334C64 428.802 83.198 448 106.666 448h298.668C428.802 448 448 428.802 448 405.334V106.666C448 83.198 428.802 64 405.334 64z"></path>
                        </svg>
                    </button>
                    <div className="volume">
                        <label htmlFor="volume">Volume</label>
                        <input id="volume" type="range" defaultValue={initialVolume} min={0} max={100} step={1} onChange={(e) => changeVolume(parseInt(e.target.value))}
                        />
                    </div>
                    <button className="settings-button" title="Settings" onClick={() => toggleSettingsView()}>
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="30px" width="30px" xmlns="http://www.w3.org/2000/svg">
                            <path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M262.29 192.31a64 64 0 1 0 57.4 57.4 64.13 64.13 0 0 0-57.4-57.4zM416.39 256a154.34 154.34 0 0 1-1.53 20.79l45.21 35.46a10.81 10.81 0 0 1 2.45 13.75l-42.77 74a10.81 10.81 0 0 1-13.14 4.59l-44.9-18.08a16.11 16.11 0 0 0-15.17 1.75A164.48 164.48 0 0 1 325 400.8a15.94 15.94 0 0 0-8.82 12.14l-6.73 47.89a11.08 11.08 0 0 1-10.68 9.17h-85.54a11.11 11.11 0 0 1-10.69-8.87l-6.72-47.82a16.07 16.07 0 0 0-9-12.22a155.3 155.3 0 0 1-21.46-12.57 16 16 0 0 0-15.11-1.71l-44.89 18.07a10.81 10.81 0 0 1-13.14-4.58l-42.77-74a10.8 10.8 0 0 1 2.45-13.75l38.21-30a16.05 16.05 0 0 0 6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 0 0-6.07-13.94l-38.19-30A10.81 10.81 0 0 1 49.48 186l42.77-74a10.81 10.81 0 0 1 13.14-4.59l44.9 18.08a16.11 16.11 0 0 0 15.17-1.75A164.48 164.48 0 0 1 187 111.2a15.94 15.94 0 0 0 8.82-12.14l6.73-47.89A11.08 11.08 0 0 1 213.23 42h85.54a11.11 11.11 0 0 1 10.69 8.87l6.72 47.82a16.07 16.07 0 0 0 9 12.22a155.3 155.3 0 0 1 21.46 12.57 16 16 0 0 0 15.11 1.71l44.89-18.07a10.81 10.81 0 0 1 13.14 4.58l42.77 74a10.8 10.8 0 0 1-2.45 13.75l-38.21 30a16.05 16.05 0 0 0-6.05 14.08c.33 4.14.55 8.3.55 12.47z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </>
    );
}

export default Sidebar;