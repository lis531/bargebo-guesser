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
    return (
        <div className="song-picker">
            <h1>Choose a song</h1>
            <div className="song-picker-songs">
                {songs.map((song) => (
                    <div key={song.id} className="song-picker-song" onClick={() => { onSongSelect(song) }}>
                        <img src={`https://picsum.photos/2000/2000?random=${song.id}`} alt="Song cover" />
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