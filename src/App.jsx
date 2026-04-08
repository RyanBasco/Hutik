import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const customPin = L.divIcon({
  className: 'custom-whisper-pin',
  html: `<div class="whisper-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function App() {
  const [selectedDistrict, setSelectedDistrict] = useState('Detecting...');
  const [coords, setCoords] = useState(null);
  const [session, setSession] = useState(null);
  const [content, setContent] = useState('');
  const [whispers, setWhispers] = useState([]);
  const [isLocating, setIsLocating] = useState(true);
  const [myReplies, setMyReplies] = useState([]);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [notification, setNotification] = useState(null);
  const [codenameMap, setCodenameMap] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (!session) return;

    const whisperChannel = supabase
      .channel('public-whispers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whispers' },
        (payload) => {
          setWhispers((prev) => [payload.new, ...prev]);
          setCodenameMap(prev => ({ ...prev, [payload.new.user_id]: payload.new.codename }));
          showStatus("A new whisper just landed in the city...");
        })
      .subscribe();

    const replyChannel = supabase
      .channel('private-echoes')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_replies', filter: `to_user_id=eq.${session.user.id}` },
        (payload) => {
          setMyReplies((prev) => [payload.new, ...prev]);
          showStatus("You received a private echo.");
        })
      .subscribe();

    return () => {
      supabase.removeChannel(whisperChannel);
      supabase.removeChannel(replyChannel);
    };
  }, [session]);

  const showStatus = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    if (session) {
      detectLocation();
      fetchWhispers();
      fetchMyReplies();
    }
  }, [session]);

  // ✅ FIX: add reverse geocoding (NEW FUNCTION)
  const getCityName = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await res.json();
      return (
        data.address.city ||
        data.address.town ||
        data.address.village ||
        data.address.state ||
        'Unknown'
      );
    } catch {
      return 'Unknown';
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      // ✅ FIX: removed Iloilo fallback
      updateDistrict('Unknown', { latitude: 0, longitude: 0 });
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => { // ✅ FIX: async added
        const { latitude, longitude } = position.coords;
        console.log("Location detected:", latitude, longitude);

        // ✅ FIX: get real city
        const city = await getCityName(latitude, longitude);

        // ✅ FIX: no more hardcoded Iloilo
        updateDistrict(city, { latitude, longitude });
      },
      (error) => {
        console.error("Location error:", error);
        // ✅ FIX: removed Iloilo fallback
        updateDistrict('Unknown', { latitude: 0, longitude: 0 });
      },
      options
    );
  };

  const updateDistrict = (dist, location) => {
    setSelectedDistrict(dist);
    setCoords(location);
    setIsLocating(false);
  };

  const fetchWhispers = async () => {
    const { data } = await supabase.from('whispers').select('*').order('created_at', { ascending: false });
    if (data) {
      setWhispers(data);
      fetchCodenamesForWhispers(data);
    }
  };

  const fetchMyReplies = async () => {
    const { data } = await supabase.from('private_replies').select('*').eq('to_user_id', session?.user.id).order('created_at', { ascending: false });
    if (data) setMyReplies(data);
  };

  const fetchCodenamesForWhispers = async (whisperList) => {
    const uniqueUserIds = [...new Set(whisperList.map(w => w.user_id))];
    const { data } = await supabase.from('profiles').select('id, codename').in('id', uniqueUserIds);
    if (data) {
      const map = {};
      data.forEach(profile => {
        map[profile.id] = profile.codename;
      });
      setCodenameMap(map);
    }
  };

  const handlePost = async () => {
    if (!content.trim() || isLocating) return;

    const { data: profileExists } = await supabase.from('profiles').select('id').eq('id', session.user.id);

    if (!profileExists || profileExists.length === 0) {
      const { error: profileError } = await supabase.from('profiles').insert([
        { id: session.user.id, codename: session.user.user_metadata?.codename || 'Anonymous' }
      ]);
      if (profileError) {
        showStatus("Error creating profile.");
        return;
      }
    }

    // ✅ FIX: reduced jitter (more accurate)
    const jitter = () => (Math.random() - 0.5) * 0.00001;

    const { error } = await supabase.from('whispers').insert([
      {
        content,
        district: selectedDistrict,
        user_id: session.user.id,
        latitude: coords.latitude + jitter(),
        longitude: coords.longitude + jitter(),
        created_at: new Date().toISOString()
      }
    ]);
    if (error) {
      showStatus(`Error: ${error.message}`);
    } else {
      setContent('');
      showStatus("Whisper dropped into the void.");
      fetchWhispers();
    }
  };

  const sendPrivateReply = async (whisper) => {
    const replyText = replyTextMap[whisper.id];
    if (!replyText || !replyText.trim()) return;

    const { error } = await supabase.from('private_replies').insert([
      { whisper_id: whisper.id, from_user_id: session.user.id, to_user_id: whisper.user_id, content: replyText }
    ]);

    if (error) {
      showStatus(`Failed to send reply: ${error.message}`);
    } else {
      setReplyTextMap(prev => ({ ...prev, [whisper.id]: '' }));
      showStatus("Echo sent privately.");
    }
  };

  // ✅ EVERYTHING BELOW IS 100% UNTOUCHED

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden bg-black font-sans">
      <div className="iloilo-bg fixed inset-0 z-0"></div>
      <div className="fixed inset-0 bg-black/40 z-1 shadow-[inset_0_0_100px_rgba(0,0,0,1)] pointer-events-none"></div>

      {notification && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-top duration-300">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-ping"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{notification}</span>
          </div>
        </div>
      )}

      {!session ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative z-10">
          <div className="mb-8 text-center animate-pulse">
            <h1 className="text-5xl font-black tracking-tighter mb-2">HUTIK</h1>
            <p className="text-[10px] uppercase tracking-[0.5em] opacity-50">Iloilo City's Secret Map</p>
          </div>
          <Auth session={session} />
        </div>
      ) : (
        <div className="relative z-10 flex flex-col min-h-screen">
          <nav className="p-4 bg-black/40 backdrop-blur-xl border-b border-white/5 flex justify-between items-center sticky top-0 z-[1000]">
            <h1 className="text-2xl font-black tracking-tighter leading-none">HUTIK</h1>
            <button onClick={() => supabase.auth.signOut()} className="text-red-500 hover:text-red-400 text-xs font-black uppercase tracking-widest transition-colors">
              Logout
            </button>
          </nav>

          <main className="max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 space-y-8">
              <div className="bg-white/5 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10 shadow-2xl">
                <textarea
                  className="w-full p-6 bg-black/40 border border-white/5 rounded-2xl text-white placeholder:text-gray-600 focus:ring-1 focus:ring-white/20 min-h-[140px] resize-none text-lg"
                  placeholder={isLocating ? "Detecting location..." : `Drop a secret in ${selectedDistrict}...`}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <button onClick={handlePost} disabled={!content.trim() || isLocating} className="w-full mt-4 bg-white text-black py-4 rounded-2xl font-black hover:bg-indigo-50 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                  {isLocating ? "Detecting GPS..." : "Post Anonymously"}
                </button>
              </div>

              <div className="h-[550px] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl relative bg-zinc-900">
                <MapContainer
                  center={[10.7202, 122.5621]}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

                  {/* GPS Marker - Always shows your current location */}
                  {coords && (
                    <Marker key="user-live-gps" position={[coords.latitude, coords.longitude]} icon={customPin}>
                      <Popup className="custom-popup">
                        <div className="p-2 min-w-[220px]">
                          <p className="text-indigo-600 font-bold text-[10px] mb-1 uppercase tracking-widest">📍 YOUR CURRENT LOCATION</p>
                          <p className="text-black font-serif italic text-sm">
                            {whispers.filter(w => w.user_id === session?.user?.id).length > 0
                              ? `You have ${whispers.filter(w => w.user_id === session?.user?.id).length} whisper(s) here. Drop another to add to this spot.`
                              : 'You are here. Drop a whisper to pin it.'}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {whispers.map((w) => {
                    if (!w.latitude || !w.longitude) return null;

                    // STRICT CHECK: Is this post mine?
                    const isMyPost = session?.user?.id && w.user_id === session.user.id;

                    return (
                      <Marker key={`whisper-${w.id}`} position={[w.latitude, w.longitude]} icon={customPin}>
                        <Popup className="custom-popup">
                          <div className="p-2 min-w-[250px]">
                            <p className="text-indigo-600 font-bold text-xs mb-2">
                              @{codenameMap[w.user_id] || 'Anonymous'} {isMyPost ? "(You)" : ""}
                            </p>
                            <p className="text-black font-serif italic text-lg leading-relaxed mb-4">"{w.content}"</p>

                            {/* FIX: If it is NOT my post, show the reply box. If it IS my post, hide it. */}
                            {!isMyPost ? (
                              <div className="mt-2 border-t border-gray-100 pt-3">
                                <input
                                  type="text"
                                  placeholder="Whisper back..."
                                  className="w-full text-xs p-2 bg-gray-50 rounded border border-gray-200 mb-2 text-black focus:outline-none"
                                  value={replyTextMap[w.id] || ''}
                                  onChange={(e) => setReplyTextMap(prev => ({ ...prev, [w.id]: e.target.value }))}
                                />
                                <button
                                  onClick={() => sendPrivateReply(w)}
                                  className="w-full bg-black text-white text-[10px] py-2 rounded-lg font-black uppercase tracking-tighter hover:bg-indigo-600 transition-colors"
                                >
                                  Send Private Echo
                                </button>
                              </div>
                            ) : (
                              <div className="mt-2 border-t border-gray-100 pt-2">
                                <p className="text-[9px] text-gray-400 uppercase tracking-tighter italic">
                                  You whispered this secret.
                                </p>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4 px-2">Your Private Echoes</h3>
              <div className="space-y-4 overflow-y-auto max-h-[80vh] px-2 custom-scrollbar">
                {myReplies.length > 0 ? myReplies.map(r => (
                  <div key={r.id} className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 animate-in slide-in-from-right duration-500">
                    <p className="text-sm text-gray-200 leading-snug">"{r.content}"</p>
                    <div className="mt-3 opacity-30 text-[8px] font-mono tracking-widest">
                      {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 opacity-20 italic text-[10px] tracking-widest">No echoes yet...</div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;