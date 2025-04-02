import './SongPicker.css';
import confetti from 'canvas-confetti';

interface Props {
    songs: {
        title: string;
        artist: string;
        cover: string;
    }[];
    onSongSelect: (index: number) => void;
}

function SongPicker({ songs, onSongSelect }: Props) {
    const triggerConfetti = (tile: HTMLElement) => {
        const rect = tile.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        confetti({
            particleCount: 100,
            spread: 90,
            origin: { x: x / window.innerWidth, y: y / window.innerHeight },
            colors: ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#FFD700'],
        });
    };

    const songSelected = (index: number) => {
        let songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
        Array.from(songsTiles).map((tile) => {
            if (tile.id == index.toString() && !tile.classList.contains("disabled")) {
                tile.classList.add("selected");
                onSongSelect(index);

                if (tile.classList.contains("correct") && localStorage.getItem("specialEffects") !== "false") {
                    triggerConfetti(tile);
                }
            }
            tile.classList.add("disabled");
            return tile;
        });
    };

    return (
        <div className="song-picker hidden">
            <h2>Choose a song</h2>
            <div className="song-picker-songs">
                {songs.map((song, index) => (
                    <div key={index} id={index.toString()} className="song-picker-song" onClick={() => { songSelected(index) }}>
                        <img src={song.cover || 'public/no-image.jpg'} alt="Song cover" />
                        <div className="song-info">
                            <p>{song.title}</p>
                            <p>{song.artist}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default SongPicker;