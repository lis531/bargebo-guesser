import './SongPicker.css'

interface Props {
    songs: {
        id: number;
        title: string;
        artist: string;
        cover: string;
        url: string;
    }[];
    onSongSelect: (song: { id: number; title: string; artist: string; cover: string; url: string; }) => void;
}

function SongPicker({ songs, onSongSelect }: Props) {
    const songSelected = (song: { id: number; title: string; artist: string; cover: string; url: string }) => {
        let songsTiles = document.querySelectorAll(".song-picker-song") as NodeListOf<HTMLElement>;
        Array.from(songsTiles).map((tile) => {
            if (tile.id == song.id.toString() && !tile.classList.contains("disabled")) {
                tile.classList.add("selected");
                onSongSelect(song);
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
                    <div key={song.id} id={song.id.toString()} className="song-picker-song" onClick={() => { songSelected(song) }}>
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