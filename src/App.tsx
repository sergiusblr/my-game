import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { RiceColor, SortingMode, InitialLayout } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Info, RotateCcw, Settings } from 'lucide-react';

export default function App() {
  const [level, setLevel] = useState(1);
  const [baseGrainCount] = useState(100);
  const [sortedTotal, setSortedTotal] = useState(0);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  
  const currentGrainCount = Math.floor(baseGrainCount * Math.pow(1.1, level - 1));

  const [sortedCount, setSortedCount] = useState<Record<RiceColor, number>>({
    white: 0,
    black: 0,
    yellow: 0,
  });
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sortingMode, setSortingMode] = useState<SortingMode>('automatic');
  const [initialLayout, setInitialLayout] = useState<InitialLayout>('pile');
  const [key, setKey] = useState(0); // For resetting the game

  const handleGrainSorted = (color: RiceColor) => {
    setSortedCount((prev) => ({
      ...prev,
      [color]: prev[color] + 1,
    }));
    
    setSortedTotal(prev => {
      const newTotal = prev + 1;
      if (newTotal >= currentGrainCount) {
        setShowLevelComplete(true);
      }
      return newTotal;
    });
  };

  const nextLevel = () => {
    setLevel(prev => prev + 1);
    setSortedTotal(0);
    setSortedCount({ white: 0, black: 0, yellow: 0 });
    setShowLevelComplete(false);
    setKey(prev => prev + 1);
  };

  const resetGame = () => {
    setLevel(1);
    setSortedTotal(0);
    setSortedCount({ white: 0, black: 0, yellow: 0 });
    setShowLevelComplete(false);
    setKey((prev) => prev + 1);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden font-sans select-none">
      {/* Background Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[url('https://www.transparenttextures.com/patterns/paper.png')]" />

      {/* Header */}
      <header className="absolute top-8 left-0 w-full px-8 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <h1 className="font-serif text-4xl italic text-stone-800 tracking-tight">Rice Sorter</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-stone-500 text-sm font-medium tracking-wide uppercase opacity-60">
              Level {level}
            </p>
            <div className="h-1.5 w-32 bg-stone-200 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-stone-400"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((sortedTotal / currentGrainCount) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto">
          <button
            onClick={() => setKey(prev => prev + 1)}
            className="px-4 py-2 rounded-full bg-white/50 hover:bg-white border border-stone-200 transition-all text-stone-600 text-sm font-medium flex items-center gap-2"
            title="Add more rice"
          >
            <span>Add More</span>
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full bg-white/50 hover:bg-white border border-stone-200 transition-all text-stone-600"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 rounded-full bg-white/50 hover:bg-white border border-stone-200 transition-all text-stone-600"
            title="How to play"
          >
            <Info size={20} />
          </button>
          <button
            onClick={resetGame}
            className="p-2 rounded-full bg-white/50 hover:bg-white border border-stone-200 transition-all text-stone-600"
            title="Reset"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      {/* Game Canvas */}
      <GameCanvas 
        key={key} 
        onGrainSorted={handleGrainSorted} 
        sortingMode={sortingMode} 
        initialGrainCount={currentGrainCount}
        initialLayout={initialLayout}
      />

      {/* Stats Overlay */}
      <div className="absolute bottom-8 left-8 flex gap-8 z-10 pointer-events-none">
        {(['white', 'black', 'yellow'] as RiceColor[]).map((color) => (
          <div key={color} className="flex flex-col items-center">
            <div 
              className="w-3 h-6 rounded-full mb-2 shadow-sm border border-stone-200"
              style={{ 
                backgroundColor: color === 'white' ? '#f8f9fa' : color === 'black' ? '#212529' : '#ffec99' 
              }}
            />
            <span className="text-stone-400 text-xs font-mono">{sortedCount[color]}</span>
          </div>
        ))}
      </div>

      {/* Level Complete Modal */}
      <AnimatePresence>
        {showLevelComplete && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/20 backdrop-blur-sm z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-12 rounded-3xl shadow-2xl text-center max-w-sm"
            >
              <h2 className="font-serif text-4xl italic text-stone-800 mb-2">Level Complete</h2>
              <p className="text-stone-500 mb-8">You have found peace in order.</p>
              <button
                onClick={nextLevel}
                className="w-full py-4 bg-stone-800 text-white rounded-2xl font-medium hover:bg-stone-700 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Next Level
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-24 right-8 w-72 p-6 bg-white/90 backdrop-blur-md rounded-2xl border border-stone-200 shadow-xl z-20"
          >
            <h3 className="font-serif text-xl mb-4 text-stone-800">Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-stone-500 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Sorting Mechanic
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl">
                  <button
                    onClick={() => setSortingMode('automatic')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      sortingMode === 'automatic' 
                        ? 'bg-white text-stone-800 shadow-sm' 
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    Automatic
                  </button>
                  <button
                    onClick={() => setSortingMode('manual')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      sortingMode === 'manual' 
                        ? 'bg-white text-stone-800 shadow-sm' 
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    Manual
                  </button>
                </div>
                <p className="text-stone-400 text-[10px] mt-2 leading-tight">
                  {sortingMode === 'automatic' 
                    ? 'Click a grain to sort it automatically.' 
                    : 'Drag and drop grains to sort them manually.'}
                </p>
              </div>

              <div>
                <label className="text-stone-500 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Initial Layout
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl">
                  <button
                    onClick={() => setInitialLayout('pile')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      initialLayout === 'pile' 
                        ? 'bg-white text-stone-800 shadow-sm' 
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    Heap
                  </button>
                  <button
                    onClick={() => setInitialLayout('scattered')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      initialLayout === 'scattered' 
                        ? 'bg-white text-stone-800 shadow-sm' 
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    Scattered
                  </button>
                </div>
                <p className="text-stone-400 text-[10px] mt-2 leading-tight">
                  {initialLayout === 'pile' 
                    ? 'Grains are poured into a central heap.' 
                    : 'Grains are scattered across the surface.'}
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowSettings(false)}
              className="mt-6 w-full py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-24 right-8 w-64 p-6 bg-white/90 backdrop-blur-md rounded-2xl border border-stone-200 shadow-xl z-20"
          >
            <h3 className="font-serif text-xl mb-3 text-stone-800">How to Play</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              {sortingMode === 'automatic' 
                ? 'Simply click on a grain of rice to sort it into its designated pile.' 
                : 'Use your mouse to drag and drop grains into their designated piles.'}
              Enjoy the tactile physics and the rhythmic process of organizing.
            </p>
            <p className="text-stone-400 text-xs mt-4 italic">
              No timers. No scores. Just peace.
            </p>
            <button 
              onClick={() => setShowInfo(false)}
              className="mt-6 w-full py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Hint */}
      <div className="absolute bottom-8 right-8 text-stone-400 text-xs tracking-widest uppercase opacity-40 pointer-events-none">
        {sortingMode === 'automatic' ? 'Click to sort' : 'Drag to sort'}
      </div>
    </div>
  );
}
