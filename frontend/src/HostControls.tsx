import { useState } from 'react';
import './HostControls.css';

interface HostControlsProps {
    gameMode: string;
    setGameMode: (gameMode: string) => void;
    roundDuration: number;
    setRoundDuration: (roundDuration: number) => void;
    artists: string[];
    setArtists: (artists: string[]) => void;
    filteredArtists: string[];
    setFilteredArtists: (filteredArtists: string[]) => void;
    selectedArtists: string[];
    setSelectedArtists: (selectedArtists: string[]) => void;
    startGame: () => void;
    hostControlsRef: React.RefObject<HTMLDivElement | null>;
    gsfeedbackRef: React.RefObject<HTMLParagraphElement | null>;
    setCurrentMode: (mode: string) => void;
}

function HostControls({ setRoundDuration, artists, filteredArtists, setFilteredArtists, selectedArtists, setSelectedArtists, startGame, hostControlsRef, gsfeedbackRef }: HostControlsProps) {
    const [currentMode, setCurrentMode] = useState<keyof typeof gameModeOptions>("normal");
    const gameModeOptions = {
        normal: "Normal",
        ultraInstinct: "Ultra Instinct",
        custom: "Custom"
    };

    return (
        <div className='host-controls invisible' ref={hostControlsRef}>
            <label htmlFor='rounds'>Number of rounds:</label>
            <input id='rounds' type="number" min={1} max={30} placeholder="Number of rounds" />
            <label htmlFor='gameMode'>Game mode:</label>
            <div className='gameMode' id='gameMode'>
                <div className='gameModeSelected' tabIndex={0} onFocus={() => {
                    document.querySelector('.gameModeOptions')?.classList.add('gameModeOptionsVisible');
                }} onBlur={() => {
                    document.querySelector('.gameModeOptions')?.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-0.5em)" }], { duration: 150, easing: 'ease', fill: 'auto' }).finished.then(() => {
                        document.querySelector('.gameModeOptions')?.classList.remove('gameModeOptionsVisible');
                    })
                }}>
                    <span id='selectedGameMode'>{gameModeOptions[currentMode]}</span>
                    <svg className='dropdownIcon' stroke="var(--text-color)" fill="var(--text-color)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                        <path d="M7 10l5 5 5-5z"></path>
                    </svg>
                </div>
                <div className='gameModeOptions'>
                    {Object.entries(gameModeOptions).map(([key, value]) => {
                        if (key === currentMode) return null;
                        return (
                            <div key={key} className='gameModeOption' onClick={() => { setCurrentMode(key as keyof typeof gameModeOptions); console.log(key); }}>
                                {value}
                            </div>
                        )
                    })}
                </div>
            </div>
            {currentMode !== "ultraInstinct" ? (
                <>
                    <label htmlFor='roundDuration'>Round duration:</label>
                    <input id='roundDuration' type="number" min={5} max={30} defaultValue={20} placeholder="Round duration" onChange={(e) => setRoundDuration(parseInt(e.target.value))} />
                </>
            ) : null}
            <label htmlFor='artists-list'>Artists:</label>
            <div className='artists-list'>
                <div className='artists-list-header'>
                    <input type="text" placeholder="Search artist" onChange={(e) => {
                        const searchValue = e.target.value.toLowerCase();
                        setFilteredArtists(artists.filter(artist => artist.toLowerCase().includes(searchValue)));
                    }} />
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 256 256" height="21px" width="21px" xmlns="http://www.w3.org/2000/svg" onClick={() => { setSelectedArtists([]); setFilteredArtists(artists) }}>
                        <path d="M235.5,216.81c-22.56-11-35.5-34.58-35.5-64.8V134.73a15.94,15.94,0,0,0-10.09-14.87L165,110a8,8,0,0,1-4.48-10.34l21.32-53a28,28,0,0,0-16.1-37,28.14,28.14,0,0,0-35.82,16,.61.61,0,0,0,0,.12L108.9,79a8,8,0,0,1-10.37,4.49L73.11,73.14A15.89,15.89,0,0,0,55.74,76.8C34.68,98.45,24,123.75,24,152a111.45,111.45,0,0,0,31.18,77.53A8,8,0,0,0,61,232H232a8,8,0,0,0,3.5-15.19ZM67.14,88l25.41,10.3a24,24,0,0,0,31.23-13.45l21-53c2.56-6.11,9.47-9.27,15.43-7a12,12,0,0,1,6.88,15.92L145.69,93.76a24,24,0,0,0,13.43,31.14L184,134.73V152c0,.33,0,.66,0,1L55.77,101.71A108.84,108.84,0,0,1,67.14,88Zm48,128a87.53,87.53,0,0,1-24.34-42,8,8,0,0,0-15.49,4,105.16,105.16,0,0,0,18.36,38H64.44A95.54,95.54,0,0,1,40,152a85.9,85.9,0,0,1,7.73-36.29l137.8,55.12c3,18,10.56,33.48,21.89,45.16Z"></path>
                    </svg>
                </div>
                <div className='artists-list-content'>
                    {filteredArtists.map((artist, index) =>
                        <div key={index} className='artist' onClick={() => { selectedArtists.includes(artist) ? setSelectedArtists(selectedArtists.filter(a => a !== artist)) : setSelectedArtists([...selectedArtists, artist]) }}>
                            {selectedArtists.includes(artist) ? (
                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg"><path d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208 208-93.31 208-208S370.69 48 256 48zm96 224h-80v80h-32v-80h-80v-32h80v-80h32v80h80z"></path></svg>
                            ) : (
                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg"><path fill="none" strokeMiterlimit="10" strokeWidth="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-93.31 192-192z"></path><path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M256 176v160m80-80H176"></path></svg>
                            )}
                            {artist}
                        </div>
                    )}
                </div>
            </div>
            <div className="inline-form-group">
                <label htmlFor="podiumBonusScore">Podium bonus score:</label>
                <input id="podiumBonusScore" type="checkbox" />
            </div>
            <p id='gsfeedback' className='error' ref={gsfeedbackRef}></p>
            <button className='submitButton' type="submit" onClick={() => startGame()}>Start</button>
        </div>
    );
}

export default HostControls;