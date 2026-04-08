import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Add pulsing animation
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 8px currentColor); }
    50% { filter: drop-shadow(0 0 16px currentColor); }
  }
  .custom-aura-pin {
    animation: pulse-glow 2s infinite;
  }
`;
document.head.appendChild(style);

// --- SEEDED RANDOM COLOR GENERATOR ---
const generateColorFromSeed = (seed) => {
  // If no seed, generate one from user ID
  const safeSeed = seed || Math.random().toString(36).substring(2, 15);
  const hueValue = Math.abs(parseInt(safeSeed.slice(0, 8), 16)) % 360;
  const saturationValue = 70 + (Math.abs(parseInt(safeSeed.slice(8, 16), 16)) % 30); // 70-100%
  const lightnessValue = 45 + (Math.abs(parseInt(safeSeed.slice(16, 24), 16)) % 25); // 45-70%
  
  return `hsl(${hueValue}, ${saturationValue}%, ${lightnessValue}%)`;
};

// --- ANONYMOUS NAME GENERATOR ---
const generateAnonName = (seed) => {
  // Ensure seed is never null
  const safeSeed = seed || Math.random().toString(36).substring(2, 15);
  
  const adjectives = ['Silent', 'Phantom', 'Ghost', 'Shadow', 'Mystic', 'Vibrant', 'Cosmic', 'Lunar', 'Solar', 'Cyber', 'Noble', 'Wild'];
  const nouns = ['Echo', 'Whisper', 'Veil', 'Spark', 'Drift', 'Wind', 'Storm', 'Wave', 'Flame', 'Frost', 'Dream', 'Void'];
  
  const adj = adjectives[Math.abs(parseInt(safeSeed.slice(0, 8), 16)) % adjectives.length];
  const noun = nouns[Math.abs(parseInt(safeSeed.slice(8, 16), 16)) % nouns.length];
  const num1 = Math.abs(parseInt(safeSeed.slice(16, 24), 16)) % 10;
  const num2 = Math.abs(parseInt(safeSeed.slice(24, 32), 16)) % 10;
  const num3 = Math.abs(parseInt(safeSeed.slice(0, 8), 16) ^ parseInt(safeSeed.slice(8, 16), 16)) % 10;
  
  return `${adj}${noun}${num1}${num2}${num3}`;
};

// --- AURA GENERATOR HELPER ---
const generateAuraIcon = (themeColor) => {
  // If no theme color, generate a random unique one
  const color = themeColor || generateColorFromSeed(Math.random().toString());
  return L.divIcon({
    className: 'custom-aura-pin',
    html: `
      <div style="
        width: 16px; 
        height: 16px; 
        background: white;
        border: 2px solid ${color};
        border-radius: 50%;
        box-shadow: 
          0 0 4px ${color},
          0 0 8px ${color};
        cursor: pointer;
      "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

function App() {
  const [selectedDistrict, setSelectedDistrict] = useState('Detecting...');
  const [coords, setCoords] = useState(null);
  const [session, setSession] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [content, setContent] = useState('');
  const [whispers, setWhispers] = useState([]);
  const [isLocating, setIsLocating] = useState(true);
  const [myReplies, setMyReplies] = useState([]);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [notification, setNotification] = useState(null);
  // Replaced codenameMap with profileMap to store seeds/colors
  const [profileMap, setProfileMap] = useState({});

  useEffect(() => {
    // Check for existing session first and wait for it to complete
    let mounted = true;
    
    const initSession = async () => {
      try {
        // First, get the currently stored session
        const { data: { session: storedSession }, error } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(storedSession);
          setIsSessionLoading(false);
        }
        
        // Then set up the listener for future changes
        if (error) console.error('Session error:', error);
      } catch (err) {
        console.error('Session init error:', err);
        if (mounted) setIsSessionLoading(false);
      }
    };
    
    initSession();
    
    // Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
      }
    });
    
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const whisperChannel = supabase
      .channel('public-whispers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whispers' },
        async (payload) => {
          // Only add if this whisper doesn't already exist
          setWhispers((prev) => {
            const exists = prev.some(w => w.id === payload.new.id);
            if (exists) return prev;
            return [payload.new, ...prev];
          });
          
          // Fetch the new user's aura data immediately
          const { data } = await supabase.from('profiles').select('aura_seed').eq('id', payload.new.user_id).single();
          if (data) {
            const safeSeed = data.aura_seed || Math.random().toString(36).substring(2, 15);
            const theme_color = generateColorFromSeed(safeSeed);
            const anonName = generateAnonName(safeSeed);
            setProfileMap(prev => ({ ...prev, [payload.new.user_id]: { ...data, theme_color, anonName } }));
          }
          showStatus("A new aura appeared in the city...");
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
      // Initialize user profile with aura_seed if needed
      const initializeProfile = async () => {
        try {
          const { data: existing, error } = await supabase.from('profiles').select('aura_seed').eq('id', session.user.id).single();
          
          if (error || !existing || !existing.aura_seed) {
            const newSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await supabase.from('profiles').upsert({ id: session.user.id, aura_seed: newSeed }, { onConflict: 'id' });
          }
        } catch (err) {
          console.error('Profile init error:', err);
        }
      };
      
      initializeProfile();
      detectLocation();
      fetchWhispers();
      fetchMyReplies();
    }
  }, [session]);

  const getCityName = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      return data.address.city || data.address.town || 'Unknown';
    } catch { return 'Unknown'; }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => { 
        const { latitude, longitude } = position.coords;
        const city = await getCityName(latitude, longitude);
        setSelectedDistrict(city);
        setCoords({ latitude, longitude });
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const fetchWhispers = async () => {
    const { data } = await supabase.from('whispers').select('*').order('created_at', { ascending: false });
    if (data) {
      setWhispers(data);
      fetchProfilesForWhispers(data);
    }
  };

  const fetchMyReplies = async () => {
    const { data } = await supabase.from('private_replies').select('*').eq('to_user_id', session?.user.id).order('created_at', { ascending: false });
    if (data) setMyReplies(data);
  };

  const fetchProfilesForWhispers = async (whisperList) => {
    const uniqueUserIds = [...new Set(whisperList.map(w => w.user_id))];
    
    // Only query if there are user IDs
    if (uniqueUserIds.length === 0) return;
    
    const { data } = await supabase.from('profiles').select('id, aura_seed').in('id', uniqueUserIds);
    if (data) {
      const map = {};
      data.forEach(p => { 
        const safeSeed = p.aura_seed || Math.random().toString(36).substring(2, 15);
        const theme_color = generateColorFromSeed(safeSeed);
        const anonName = generateAnonName(safeSeed);
        map[p.id] = { ...p, theme_color, anonName }; 
      });
      setProfileMap(map);
    }
  };

  const handlePost = async () => {
    if (!content.trim() || isLocating) return;

    try {
      // Ensure profile exists with aura_seed
      const { data: profile, error } = await supabase.from('profiles').select('aura_seed').eq('id', session.user.id).single();
      
      if (error || !profile || !profile.aura_seed) {
        // Create or update profile with a random aura_seed if missing
        const newSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await supabase.from('profiles').upsert({ id: session.user.id, aura_seed: newSeed }, { onConflict: 'id' });
      }

      const jitter = () => (Math.random() - 0.5) * 0.0004;
      const { error: postError } = await supabase.from('whispers').insert([{
        content, 
        district: selectedDistrict, 
        user_id: session.user.id,
        latitude: coords.latitude + jitter(), 
        longitude: coords.longitude + jitter()
      }]);

      if (postError) {
        showStatus("Error posting whisper.");
      } else {
        setContent('');
        showStatus("Whisper dropped.");
        fetchWhispers();
      }
    } catch (err) {
      console.error('Post error:', err);
      showStatus("Error posting whisper.");
    }
  };

  const sendPrivateReply = async (whisper) => {
    const replyText = replyTextMap[whisper.id];
    if (!replyText || !replyText.trim()) return;
    const { error } = await supabase.from('private_replies').insert([
      { whisper_id: whisper.id, from_user_id: session.user.id, to_user_id: whisper.user_id, content: replyText }
    ]);
    if (!error) {
      setReplyTextMap(prev => ({ ...prev, [whisper.id]: '' }));
      showStatus("Echo sent privately.");
    }
  };

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden bg-black font-sans">
      <div className="iloilo-bg fixed inset-0 z-0"></div>
      <div className="fixed inset-0 bg-black/40 z-1 shadow-[inset_0_0_100px_rgba(0,0,0,1)] pointer-events-none"></div>

      {notification && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999]">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 px-6 py-3 rounded-full flex items-center gap-3">
            <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{notification}</span>
          </div>
        </div>
      )}

      {!session ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative z-10">
          <h1 className="text-5xl font-black tracking-tighter mb-2 animate-pulse">HUTIK</h1>
          {!isSessionLoading && <Auth />}
        </div>
      ) : (
        <div className="relative z-10 flex flex-col min-h-screen">
          <nav className="p-4 bg-black/40 backdrop-blur-xl border-b border-white/5 flex justify-between items-center sticky top-0 z-[1000]">
            <h1 className="text-2xl font-black tracking-tighter">HUTIK</h1>
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 hover:border-red-500 rounded-lg text-white font-black uppercase tracking-widest cursor-pointer transition-all duration-200 active:scale-95"
            >
              Logout
            </button>
          </nav>

          <main className="max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3 space-y-8">
              <div className="bg-white/5 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10">
                <textarea
                  className="w-full p-6 bg-black/40 border border-white/5 rounded-2xl text-white placeholder:text-gray-600 focus:ring-1 focus:ring-white/20 min-h-[140px] resize-none text-lg cursor-text"
                  placeholder={isLocating ? "Detecting location..." : `Drop a secret in ${selectedDistrict}...`}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <button onClick={handlePost} disabled={!content.trim() || isLocating} className="w-full mt-4 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest cursor-pointer hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed">
                  {isLocating ? "Detecting GPS..." : "Post Anonymously"}
                </button>
              </div>

              <div className="h-[550px] rounded-[2.5rem] overflow-hidden border border-white/10 relative bg-zinc-900">
                <MapContainer center={[10.7202, 122.5621]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

                  {whispers.map((w) => {
                    if (!w.latitude || !w.longitude) return null;
                    const isMyPost = session?.user?.id === w.user_id;
                    const userProfile = profileMap[w.user_id];
                    
                    return (
                      <Marker 
                        key={`whisper-${w.id}`} 
                        position={[w.latitude, w.longitude]} 
                        icon={generateAuraIcon(userProfile?.theme_color)}
                      >
                        <Popup className="custom-popup">
                          <div className="p-2 min-w-[250px]">
                            <div className="flex items-center gap-2 mb-2">
                              <div style={{ width: 12, height: 12, borderRadius: '50%', background: userProfile?.theme_color || '#FF6B6B', boxShadow: `0 0 8px ${userProfile?.theme_color || '#FF6B6B'}` }}></div>
                              <p className="text-indigo-600 font-bold text-[10px] uppercase tracking-widest">
                                {userProfile?.anonName || 'Anonymous'} {isMyPost ? "(You)" : ""}
                              </p>
                            </div>
                            <p className="text-black font-serif italic text-lg leading-relaxed mb-4">"{w.content}"</p>
                            {!isMyPost && (
                              <div className="mt-2 border-t border-gray-100 pt-3">
                                <input
                                  type="text"
                                  placeholder="Whisper back..."
                                  className="w-full text-xs p-2 bg-gray-50 rounded border border-gray-200 mb-2 text-black cursor-text"
                                  value={replyTextMap[w.id] || ''}
                                  onChange={(e) => setReplyTextMap(prev => ({ ...prev, [w.id]: e.target.value }))}
                                />
                                <button onClick={() => sendPrivateReply(w)} className="w-full bg-black text-white text-[10px] py-2 rounded-lg font-black uppercase cursor-pointer">Send Private Echo</button>
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
              <div className="space-y-4 overflow-y-auto max-h-[80vh] px-2">
                {myReplies.length > 0 ? myReplies.map(r => (
                  <div key={r.id} className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10">
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