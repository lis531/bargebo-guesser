import './SongPicker.css'

interface Props {
    songs: {
        title: string;
        artist: string;
        cover: string;
    }[];
    onSongSelect: (index: number) => void;
}

function SongPicker({ songs, onSongSelect }: Props) {
    const songSelected = (index: number) => {
        let songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
        Array.from(songsTiles).map((tile) => {
            if (tile.id == index.toString() && !tile.classList.contains("disabled")) {
                tile.classList.add("selected");
                onSongSelect(index);
            }
            tile.classList.add("disabled");
            return tile;
        });
    }

    return (
        <div className="song-picker">
            <h1>Choose a song</h1>
            <div className="song-picker-songs">
                {songs.map((song, index) => (
                    <div key={index} id={index.toString()} className="song-picker-song" onClick={() => { songSelected(index) }}>
                        <img src={song.cover} alt="Song cover" />
                        <div className="song-info">
                            <p>{song.title}</p>
                            <p>{song.artist}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default SongPicker;