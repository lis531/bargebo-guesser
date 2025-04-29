import './SongPicker.css';
import confetti from 'canvas-confetti';

interface Props {
    songs: {
        title: string;
        artist: string;
        cover: string;
    }[];
    onSongSelect: (index: number) => void;
    ref: React.RefObject<HTMLDivElement | null>;
}

function SongPicker({ songs, onSongSelect, ref }: Props) {
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

    const handleImageLoad = (img: HTMLImageElement) => {
        img.animate([
            { opacity: 0, filter: 'blur(10px)' },
            { opacity: 1, filter: 'blur(0px)' }
        ], 300);
    }

    return (
        <div className="song-picker hidden invisible" ref={ref}>
            <h2>Choose a song</h2>
            <div className="song-picker-songs">
                {songs.map((song, index) => (
                    <div key={index} id={index.toString()} className="song-picker-song" onClick={() => { songSelected(index) }} onLoad={(e) => handleImageLoad(e.currentTarget.children[0] as HTMLImageElement)}>
                        <img src={song.cover ? song.cover : "/no-image.avif"} alt={`${song.title} cover`} onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.src = "/no-image.avif"; }} />
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