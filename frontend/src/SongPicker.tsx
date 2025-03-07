import './SongPicker.css'

interface Props {
    songs: {
        id: string;
        title: string;
        artist: string;
        cover: string;
    }[];
    onSongSelect: (song: { id: string; title: string; artist: string; cover: string; }) => void;
}

function SongPicker({ songs, onSongSelect }: Props) {
    const songSelected = (song: { id: string; title: string; artist: string; cover: string; }) => {
        onSongSelect(song);
        let songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
        Array.from(songsTiles).map((tile) => {
            if (tile.id == song.id && !tile.classList.contains("disabled")) {
                tile.classList.add("selected");
            }
            tile.classList.add("disabled");
            return tile;
        });
    }

    return (
        <div className="song-picker">
            <h1>Choose a song</h1>
            <div className="song-picker-songs">
                {songs.map((song) => (
                    <div key={song.id} id={song.id} className="song-picker-song" onClick={() => { songSelected(song) }}>
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