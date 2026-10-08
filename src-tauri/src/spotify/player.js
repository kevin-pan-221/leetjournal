// Fixed JXA program. Only a typed operation and numeric argument cross in from
// Rust; track names, URLs and user text are never evaluated as script source.
function run(argv) {
  try {
    var app;
    try { app = Application('com.spotify.client'); }
    catch (_) { return JSON.stringify({ error: 'missing' }); }
    var operation = argv[0];
    var empty = { running: false, is_playing: false, progress_ms: 0, volume_percent: 0, item: null };
    if (operation === 'enable' || operation === 'open') {
      app.activate();
    } else if (!app.running()) {
      return JSON.stringify(operation === 'playback' ? empty : { error: 'closed' });
    }
    // Request consent only on explicit enable. Controls acknowledge immediately;
    // song metadata belongs to the separate, interruptible playback read.
    if (operation === 'enable') app.playerState();
    if (operation === 'play') app.play();
    else if (operation === 'pause') app.pause();
    else if (operation === 'next') app.nextTrack();
    else if (operation === 'previous') app.previousTrack();
    else if (operation === 'volume') app.soundVolume = Math.min(100, Math.max(0, Number(argv[1])));
    else if (operation === 'seek') {
      // Spotify exposes track duration in milliseconds, position in seconds.
      app.playerPosition = Math.min(Number(argv[1]), app.currentTrack.duration()) / 1000;
    }
    if (operation !== 'playback') return 'null';
    var state = app.playerState();
    var result = { running: true, is_playing: state === 'playing', progress_ms: 0,
      volume_percent: Math.round(app.soundVolume()), item: null };
    if (state !== 'stopped') {
      var track = app.currentTrack;
      function optional(read) { try { return read() || ''; } catch (_) { return ''; } }
      result.item = { name: track.name(), artist: optional(function () { return track.artist(); }), duration_ms: Math.round(track.duration()),
        artwork_url: optional(function () { return track.artworkUrl(); }), url: optional(function () { return track.spotifyUrl(); }) };
      result.progress_ms = Math.max(0, Math.round(app.playerPosition() * 1000));
    }
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: error.errorNumber === -1743 ? 'permission'
      : error.errorNumber === -10814 ? 'missing' : 'unavailable' });
  }
}
