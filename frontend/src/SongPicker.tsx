import './SongPicker.css'

function SongPicker() {
    const songs = [
        { title: 'Timeless', artist: 'The Weeknd', id: '1' },
        { title: 'Chiquitita', artist: 'Abba', id: '2' },
        { title: 'Wolves', artist: 'Kanye West', id: '3' },
    ];

    const pickSong = (id: string) => {
        console.log(`Picked song with id ${id}`);
    }
    
    return (
        <div className="song-picker">
            <h1>Choose a song</h1>
            <div className="song-picker-songs">
                {songs.map((song) => (
                    <div key={song.id} className="song-picker-song" onClick={() => pickSong(song.id)}>
                        <img src={`https://picsum.photos/2000/2000?random0`} alt="Song cover" />
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

export default SongPicker
