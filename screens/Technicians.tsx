import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, MapPin, Phone, Star, Clock, Search, Wrench, Zap, Shield, CheckCircle, Navigation, Loader2, RefreshCw, Globe, ExternalLink, MessageCircle } from 'lucide-react';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface TechniciansProps {
  onBack: () => void;
  viewMode?: ViewMode;
}

interface Technician {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  reviews_count: number;
  distance_km: number;
  availability_text: string;
  phone: string;
  is_verified: boolean;
  is_available: boolean;
  experience_years: number;
  services: string[];
  city: string;
  latitude: number;
  longitude: number;
  place_id?: string;
  photo_url?: string;
}

interface UserLocation {
  lat: number;
  lng: number;
}

// Google Places API Key
const GOOGLE_API_KEY = 'AIzaSyAwzn80knR4sxMz9qePjra8cV8AGWkraWo';

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal
};

const Technicians: React.FC<TechniciansProps> = ({ onBack, viewMode = 'mobile' }) => {
  const isCompact = viewMode === 'web' || viewMode === 'tablet';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchCategory, setSearchCategory] = useState('electrician');

  // Get user's geolocation
  const getUserLocation = useCallback(() => {
    setLocationError(null);
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      // Fallback to Kolkata
      setUserLocation({ lat: 22.5726, lng: 88.3639 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.log('Location error:', error.message);
        setLocationError('Location access denied - using default location');
        // Fallback to Kolkata
        setUserLocation({ lat: 22.5726, lng: 88.3639 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // Fetch technicians from Google Places API
  const fetchTechnicians = useCallback(async () => {
    if (!userLocation) return;

    setLoading(true);
    try {
      // Google Places Nearby Search API
      const radius = 10000; // 10km radius
      const type = 'electrician'; // Can also search for: plumber, contractor, etc.
      const keyword = searchCategory || 'electrician';
      
      // Using CORS proxy for development - in production, call from your backend
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${userLocation.lat},${userLocation.lng}&radius=${radius}&type=${type}&keyword=${keyword}&key=${GOOGLE_API_KEY}`;
      
      // For development, we'll use a CORS proxy
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        const mappedTechnicians: Technician[] = data.results.map((place: any, index: number) => ({
          id: place.place_id || `tech-${index}`,
          name: place.name,
          specialty: place.types?.includes('electrician') ? 'Electrician' : 
                     place.types?.includes('plumber') ? 'Plumber' : 
                     place.types?.includes('contractor') ? 'Contractor' : 'Technician',
          rating: place.rating || 4.0,
          reviews_count: place.user_ratings_total || 0,
          distance_km: calculateDistance(
            userLocation.lat, 
            userLocation.lng, 
            place.geometry.location.lat, 
            place.geometry.location.lng
          ),
          availability_text: place.opening_hours?.open_now ? 'Open Now' : 'Closed',
          phone: '', // Need Place Details API for phone
          is_verified: place.business_status === 'OPERATIONAL',
          is_available: place.opening_hours?.open_now ?? true,
          experience_years: Math.floor(Math.random() * 15) + 1, // Placeholder
          services: place.types?.filter((t: string) => !['point_of_interest', 'establishment'].includes(t)) || [],
          city: place.vicinity?.split(',').pop()?.trim() || '',
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          place_id: place.place_id,
          photo_url: place.photos?.[0] 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
            : undefined
        }));
        
        setTechnicians(mappedTechnicians.sort((a, b) => a.distance_km - b.distance_km));
      } else if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
        console.error('API Error:', data.error_message);
        // Fallback to demo data if API key is not set
        setTechnicians(getDemoTechnicians(userLocation));
      } else {
        setTechnicians([]);
      }
    } catch (err) {
      console.error('Error fetching technicians:', err);
      // Fallback to demo data on error
      setTechnicians(getDemoTechnicians(userLocation));
    } finally {
      setLoading(false);
    }
  }, [userLocation, searchCategory]);

  // Demo data fallback when API key is not configured
  const getDemoTechnicians = (location: UserLocation): Technician[] => {
    const demoData = [
      { name: 'Rajesh Electrical Works', specialty: 'Electrical Wiring & Repairs', rating: 4.8, reviews: 156, lat: location.lat + 0.01, lng: location.lng + 0.01 },
      { name: 'Kumar AC & Appliance', specialty: 'AC Installation & Repair', rating: 4.6, reviews: 89, lat: location.lat - 0.015, lng: location.lng + 0.02 },
      { name: 'Sharma Electronics', specialty: 'Smart Meter & IoT', rating: 4.9, reviews: 203, lat: location.lat + 0.02, lng: location.lng - 0.01 },
      { name: 'Singh Electric Co.', specialty: 'Solar Panel Installation', rating: 4.5, reviews: 67, lat: location.lat - 0.008, lng: location.lng - 0.015 },
      { name: 'Patel Power Solutions', specialty: 'Home Automation', rating: 4.7, reviews: 124, lat: location.lat + 0.025, lng: location.lng + 0.005 },
      { name: 'Das Electricals', specialty: 'Industrial Electrician', rating: 4.4, reviews: 45, lat: location.lat - 0.02, lng: location.lng + 0.018 },
    ];

    return demoData.map((d, i) => ({
      id: `demo-${i}`,
      name: d.name,
      specialty: d.specialty,
      rating: d.rating,
      reviews_count: d.reviews,
      distance_km: calculateDistance(location.lat, location.lng, d.lat, d.lng),
      availability_text: Math.random() > 0.3 ? 'Open Now' : 'Closed',
      phone: `+91 98765 4321${i}`,
      is_verified: Math.random() > 0.4,
      is_available: Math.random() > 0.3,
      experience_years: Math.floor(Math.random() * 15) + 3,
      services: ['Repairs', 'Installation', 'Maintenance'],
      city: 'Near You',
      latitude: d.lat,
      longitude: d.lng,
    }));
  };

  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  useEffect(() => {
    if (userLocation) {
      fetchTechnicians();
    }
  }, [userLocation, fetchTechnicians]);

  // Filter technicians
  const filteredTechnicians = technicians.filter(tech => {
    const matchesSearch = 
      tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.services?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    if (activeFilter === 'All') return matchesSearch;
    if (activeFilter === 'Open Now') return matchesSearch && tech.is_available;
    if (activeFilter === 'Verified') return matchesSearch && tech.is_verified;
    if (activeFilter === 'Top Rated') return matchesSearch && tech.rating >= 4.5;
    if (activeFilter === 'Nearby') return matchesSearch && tech.distance_km <= 3;
    
    return matchesSearch;
  });

  // Open Google Maps directions
  const openDirections = (tech: Technician) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${tech.latitude},${tech.longitude}`;
    window.open(url, '_blank');
  };

  return (
    <div className="h-full bg-white overflow-hidden flex flex-col">
      {/* Google Maps Style Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          
          {/* Search Box - Google Style */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="technician near me"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white border border-transparent focus:border-slate-200"
            />
          </div>
        </div>

        {/* Filter Chips - Google Style */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {['All', 'Top Rated', 'Open Now', 'Verified', 'Nearby'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                activeFilter === filter
                  ? 'bg-blue-100 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {filter === 'Top Rated' && <Star className="w-3 h-3 inline mr-1" />}
              {filter === 'Nearby' && <MapPin className="w-3 h-3 inline mr-1" />}
              {filter}
            </button>
          ))}
        </div>

        {/* Category Selector */}
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { key: 'electrician', label: '⚡ Electrician' },
            { key: 'ac repair', label: '❄️ AC Repair' },
            { key: 'plumber', label: '🔧 Plumber' },
            { key: 'solar', label: '☀️ Solar' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSearchCategory(cat.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                searchCategory === cat.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* Results Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">Results</span>
          <span className="text-xs text-slate-400">ⓘ</span>
        </div>
        <button 
          onClick={fetchTechnicians}
          disabled={loading}
          className="text-blue-600 text-sm font-medium hover:underline flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {/* Location Warning */}
      {locationError && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <Navigation className="w-4 h-4 text-amber-600" />
          <span className="text-xs text-amber-700 flex-1">{locationError}. Showing results for Kolkata.</span>
        </div>
      )}

      {/* Technicians List - Google Maps Style */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-slate-500 text-sm">Finding technicians...</p>
          </div>
        ) : filteredTechnicians.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Wrench className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No results found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div>
            {filteredTechnicians.map((tech, idx) => (
              <motion.div
                key={tech.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setSelectedTechnician(tech)}
              >
                <div className="px-4 py-4">
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-blue-700 text-[15px] leading-tight hover:underline">
                        {tech.name}
                        {tech.is_verified && (
                          <Shield className="w-3.5 h-3.5 text-blue-500 inline ml-1.5 -mt-0.5" fill="currentColor" />
                        )}
                      </h3>
                      
                      {/* Rating */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-sm font-medium text-slate-700">{tech.rating}</span>
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${i < Math.floor(tech.rating) ? 'text-amber-400' : 'text-slate-300'}`}
                              fill="currentColor"
                            />
                          ))}
                        </div>
                        <span className="text-sm text-slate-500">({tech.reviews_count})</span>
                      </div>

                      {/* Category & Address */}
                      <p className="text-sm text-slate-600 mt-1">{tech.specialty}</p>
                      <p className="text-sm text-slate-500">{tech.city} · {tech.distance_km} km away</p>

                      {/* Availability Status */}
                      <p className={`text-sm mt-1 ${tech.is_available ? 'text-green-600' : 'text-slate-500'}`}>
                        {tech.is_available ? (
                          <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>Open</>
                        ) : (
                          <><span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>{tech.availability_text}</>
                        )}
                        {' · '}{tech.phone}
                      </p>

                      {/* Review Snippet */}
                      {tech.services && tech.services.length > 0 && (
                        <p className="text-sm text-slate-500 mt-2 flex items-start gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="italic">"{tech.services.slice(0, 2).join(', ')}"</span>
                        </p>
                      )}
                    </div>

                    {/* Action Buttons - Google Style */}
                    <div className="flex flex-col gap-2">
                      <a
                        href={`tel:${tech.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Call"
                      >
                        <Phone className="w-5 h-5" />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDirections(tech);
                        }}
                        className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Directions"
                      >
                        <Navigation className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Update results note */}
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" className="rounded" />
              <span>Update results when map moves</span>
            </div>
          </div>
        )}
      </div>

      {/* Technician Detail Modal - Google Maps Style */}
      {selectedTechnician && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center"
          onClick={() => setSelectedTechnician(null)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full md:w-[400px] md:rounded-xl rounded-t-2xl max-h-[85vh] overflow-hidden"
          >
            {/* Header Image Placeholder */}
            <div className="h-32 bg-gradient-to-br from-slate-200 to-slate-300 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl font-bold text-slate-600">
                  {selectedTechnician.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
              </div>
              <button 
                onClick={() => setSelectedTechnician(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-slate-600 hover:bg-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(85vh-8rem)]">
              {/* Name & Rating */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-medium text-slate-800">{selectedTechnician.name}</h2>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="font-medium">{selectedTechnician.rating}</span>
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < Math.floor(selectedTechnician.rating) ? 'text-amber-400' : 'text-slate-300'}`}
                        fill="currentColor"
                      />
                    ))}
                  </div>
                  <span className="text-slate-500">({selectedTechnician.reviews_count} reviews)</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{selectedTechnician.specialty}</p>
              </div>

              {/* Quick Action Buttons */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  onClick={() => openDirections(selectedTechnician)}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <Navigation className="w-5 h-5" />
                  <span className="text-xs font-medium">Directions</span>
                </button>
                <a
                  href={`tel:${selectedTechnician.phone}`}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  <span className="text-xs font-medium">Call</span>
                </a>
                <button className="flex flex-col items-center gap-1 py-3 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                  <Globe className="w-5 h-5" />
                  <span className="text-xs font-medium">Website</span>
                </button>
              </div>

              {/* Info List */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-800">{selectedTechnician.city}</p>
                    <p className="text-xs text-slate-500">{selectedTechnician.distance_km} km from your location</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className={`text-sm ${selectedTechnician.is_available ? 'text-green-600' : 'text-slate-800'}`}>
                      {selectedTechnician.is_available ? 'Open Now' : selectedTechnician.availability_text}
                    </p>
                    <p className="text-xs text-slate-500">{selectedTechnician.experience_years} years experience</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-slate-400 mt-0.5" />
                  <p className="text-sm text-blue-600">{selectedTechnician.phone}</p>
                </div>

                {selectedTechnician.is_verified && (
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" />
                    <p className="text-sm text-slate-800">Verified Professional</p>
                  </div>
                )}
              </div>

              {/* Services */}
              {selectedTechnician.services && selectedTechnician.services.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-medium text-slate-800 mb-2">Services</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTechnician.services.map((service) => (
                      <span
                        key={service}
                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Call Button */}
              <a
                href={`tel:${selectedTechnician.phone}`}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
              >
                <Phone className="w-5 h-5" />
                Call Now
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default Technicians;
