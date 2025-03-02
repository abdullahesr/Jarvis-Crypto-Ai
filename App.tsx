import React, { useState, useEffect, useCallback, useRef } from 'react';
import 'regenerator-runtime/runtime';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { Mic, MicOff, Volume2, PauseCircle, PlayCircle } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Define types for cryptocurrency data
interface CryptoData {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  highPrice: string;
  lowPrice: string;
}

// Define type for historical price data
interface HistoricalPrice {
  time: number;
  price: number;
}

function App() {
  const [autoListening, setAutoListening] = useState(true);
  const [listening, setListening] = useState(false);
  const [cryptoData, setCryptoData] = useState<CryptoData | null>(null);
  const [historicalPrices, setHistoricalPrices] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const wakeWordTimer = useRef<NodeJS.Timeout | null>(null);
  const processingCommand = useRef(false);
  const [lastInteraction, setLastInteraction] = useState<string>('');

  const { transcript, resetTranscript, browserSupportsSpeechRecognition } = useSpeechRecognition();

  // Function to fetch historical price data
  const fetchHistoricalPrices = useCallback(async (symbol: string) => {
    try {
      const normalizedSymbol = normalizeSymbol(symbol);
      if (!normalizedSymbol) return;
      
      // Get data for the last 7 days (7 * 24 hours)
      const endTime = Date.now();
      const startTime = endTime - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${normalizedSymbol}&interval=1d&startTime=${startTime}&endTime=${endTime}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data for ${normalizedSymbol}`);
      }
      
      const data = await response.json();
      
      // Format the data for the chart
      // Binance klines format: [openTime, open, high, low, close, volume, closeTime, ...]
      const prices = data.map((item: any[]) => ({
        time: item[0],
        price: parseFloat(item[4]) // Close price
      }));
      
      setHistoricalPrices(prices);
      
    } catch (err) {
      console.error('Error fetching historical price data:', err);
    }
  }, []);

  // Function to fetch crypto data from Binance API
  const fetchCryptoData = useCallback(async (symbol: string) => {
    try {
      setLoading(true);
      setError(null);
      setSpeaking(true); // Set speaking to true immediately to show the GIF
      setLastInteraction('crypto');
      
      // Normalize the symbol to match Binance format (e.g., "bitcoin" -> "BTCUSDT")
      const normalizedSymbol = normalizeSymbol(symbol);
      
      if (!normalizedSymbol) {
        throw new Error(`Could not recognize cryptocurrency: ${symbol}`);
      }
      
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${normalizedSymbol}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data for ${normalizedSymbol}`);
      }
      
      const data = await response.json();
      
      setCryptoData({
        symbol: normalizedSymbol,
        priceChange: data.priceChange,
        priceChangePercent: data.priceChangePercent,
        lastPrice: data.lastPrice,
        volume: data.volume,
        highPrice: data.highPrice,
        lowPrice: data.lowPrice
      });
      
      // Fetch historical price data for the chart
      await fetchHistoricalPrices(symbol);
      
      // Speak the analysis
      speakAnalysis({
        symbol: normalizedSymbol,
        priceChange: data.priceChange,
        priceChangePercent: data.priceChangePercent,
        lastPrice: data.lastPrice,
        volume: data.volume,
        highPrice: data.highPrice,
        lowPrice: data.lowPrice
      });
      
    } catch (err) {
      console.error('Error fetching crypto data:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      speakText(`I'm sorry, I couldn't retrieve data for ${symbol}. ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  }, [fetchHistoricalPrices]);

  // Function to normalize cryptocurrency names to Binance symbols
  const normalizeSymbol = (input: string): string | null => {
    const normalizedInput = input.toLowerCase().trim();
    
    const symbolMap: Record<string, string> = {
      'bitcoin': 'BTCUSDT',
      'btc': 'BTCUSDT',
      'ethereum': 'ETHUSDT',
      'eth': 'ETHUSDT',
      'binance coin': 'BNBUSDT',
      'bnb': 'BNBUSDT',
      'cardano': 'ADAUSDT',
      'ada': 'ADAUSDT',
      'solana': 'SOLUSDT',
      'sol': 'SOLUSDT',
      'ripple': 'XRPUSDT',
      'xrp': 'XRPUSDT',
      'dogecoin': 'DOGEUSDT',
      'doge': 'DOGEUSDT',
      'polkadot': 'DOTUSDT',
      'dot': 'DOTUSDT',
      'avalanche': 'AVAXUSDT',
      'avax': 'AVAXUSDT',
      'shiba inu': 'SHIBUSDT',
      'shib': 'SHIBUSDT',
      'litecoin': 'LTCUSDT',
      'ltc': 'LTCUSDT',
      'chainlink': 'LINKUSDT',
      'link': 'LINKUSDT',
      'polygon': 'MATICUSDT',
      'matic': 'MATICUSDT',
    };
    
    return symbolMap[normalizedInput] || null;
  };

  // Function to speak text using the Web Speech API with improved pronunciation
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      setSpeaking(true);
      
      // Format text to improve pronunciation of symbols and numbers
      const formattedText = text
        .replace(/\$/g, ' dollars ')
        .replace(/%/g, ' percent ')
        .replace(/(\d+)\.(\d+)/g, (match, whole, decimal) => {
          // For prices, read as dollars and cents if it looks like a price
          if (match.includes('$') || text.toLowerCase().includes('price') || text.toLowerCase().includes('dollar')) {
            return `${whole} dollars and ${decimal} cents`;
          }
          // Otherwise read as number point number
          return `${whole} point ${decimal}`;
        })
        .replace(/\n/g, '. ') // Replace newlines with pauses
        .replace(/\s+/g, ' '); // Normalize spaces
      
      const utterance = new SpeechSynthesisUtterance(formattedText);
      
      // Set language to English
      utterance.lang = 'en-US';
      
      // Adjust speech parameters for better clarity
      utterance.rate = 0.9; // Slightly slower than default
      utterance.pitch = 1.0; // Normal pitch
      utterance.volume = 1.0; // Maximum volume
      
      // Try to use a more natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const englishVoices = voices.filter(voice => 
        voice.lang.includes('en-') && !voice.name.includes('Microsoft')
      );
      
      if (englishVoices.length > 0) {
        // Prefer Google voices if available
        const googleVoice = englishVoices.find(voice => voice.name.includes('Google'));
        utterance.voice = googleVoice || englishVoices[0];
      }
      
      // Add pauses at punctuation
      utterance.onboundary = (event) => {
        if (event.name === 'sentence' || event.name === 'word') {
          // Small pause at sentence boundaries
          if (event.name === 'sentence') {
            setTimeout(() => {}, 200);
          }
        }
      };
      
      utterance.onend = () => {
        setSpeaking(false);
        processingCommand.current = false; // Reset processing flag when speech ends
      };
      
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      // Start speaking
      window.speechSynthesis.speak(utterance);
    }
  };

  // Function to generate and speak analysis based on crypto data
  const speakAnalysis = (data: CryptoData) => {
    const readableSymbol = data.symbol.replace('USDT', '');
    
    const priceChangeNum = parseFloat(data.priceChange);
    const priceChangePercentNum = parseFloat(data.priceChangePercent);
    const lastPriceNum = parseFloat(data.lastPrice);
    
    let trend = priceChangeNum > 0 ? "upward" : "downward";
    let sentiment = priceChangeNum > 0 ? "positive" : "negative";
    
    if (Math.abs(priceChangePercentNum) < 0.5) {
      trend = "relatively stable";
      sentiment = "neutral";
    }
    
    // Format the analysis with clear pauses and better structure for speech
    const analysis = 
      `Here's my analysis for ${readableSymbol}. ` +
      `The current price is $${lastPriceNum.toFixed(2)} US dollars. ` +
      `In the last 24 hours, the price has changed by $${priceChangeNum.toFixed(2)} dollars, ` +
      `which is a ${Math.abs(priceChangePercentNum).toFixed(2)}% ${priceChangeNum > 0 ? 'increase' : 'decrease'}. ` +
      `The highest price reached was $${parseFloat(data.highPrice).toFixed(2)} dollars, ` +
      `while the lowest was $${parseFloat(data.lowPrice).toFixed(2)} dollars. ` +
      `The trading volume is approximately ${(parseFloat(data.volume) / 1000000).toFixed(2)} million dollars. ` +
      `Overall, ${readableSymbol} is showing a ${trend} trend with ${sentiment} momentum in the last 24 hours. ` +
      `${generateAdvice(priceChangePercentNum, trend)}`;
    
    speakText(analysis);
  };

  // Function to generate simple advice based on price movement
  const generateAdvice = (priceChangePercent: number, trend: string): string => {
    if (Math.abs(priceChangePercent) > 5) {
      return priceChangePercent > 0 
        ? "Be cautious as this significant upward movement might be followed by a correction."
        : "This significant drop might present a buying opportunity, but be aware that the downtrend might continue.";
    } else if (trend === "relatively stable") {
      return "The market appears to be consolidating. This might be a period of accumulation before the next significant move.";
    } else {
      return "Consider your investment strategy based on your risk tolerance and long-term outlook.";
    }
  };

  // Function to handle general conversation
  const handleConversation = (text: string) => {
    processingCommand.current = true;
    setSpeaking(true);
    setLastInteraction('conversation');
    
    // Convert to lowercase for easier matching
    const lowerText = text.toLowerCase();
    
    // Who are you questions
    if (lowerText.includes('who are you') || 
        lowerText.includes('what are you') || 
        lowerText.includes('your name') ||
        (lowerText.includes('who') && lowerText.includes('jarvis'))) {
      speakText("I am Jarvis, an AI cryptocurrency analysis assistant developed by Eser Software. I was designed to help you track and analyze cryptocurrency markets in real-time. I can provide you with price information, market trends, and basic investment insights for various cryptocurrencies.");
    }
    // How are you questions
    else if (lowerText.includes('how are you') || 
             lowerText.includes('how do you feel') || 
             lowerText.includes('how\'s it going')) {
      const responses = [
        "I'm functioning optimally, thank you for asking. How can I assist you with cryptocurrency analysis today?",
        "I'm operating at peak efficiency. Ready to analyze any cryptocurrency you're interested in.",
        "All systems are running smoothly. I'm ready to provide you with crypto market insights whenever you need them."
      ];
      speakText(responses[Math.floor(Math.random() * responses.length)]);
    }
    // What can you do questions
    else if (lowerText.includes('what can you do') || 
             lowerText.includes('your capabilities') || 
             lowerText.includes('help me')) {
      speakText("I can provide real-time cryptocurrency analysis. Just mention a cryptocurrency like Bitcoin or Ethereum, and I'll fetch the latest market data including price, 24-hour changes, trading volume, and a 7-day price chart. I can also offer basic market insights based on recent price movements. Feel free to ask me about any major cryptocurrency.");
    }
    // Time-related questions
    else if (lowerText.includes('what time') || lowerText.includes('what day') || lowerText.includes('what is the date')) {
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
      const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      speakText(`The current time is ${timeString} and today is ${dateString}.`);
    }
    // Weather questions - explain we can't do this
    else if (lowerText.includes('weather') || lowerText.includes('temperature')) {
      speakText("I'm sorry, I don't have access to weather information. I specialize in cryptocurrency analysis. Is there a specific cryptocurrency you'd like information about?");
    }
    // Jokes about crypto
    else if (lowerText.includes('joke') || lowerText.includes('funny')) {
      const jokes = [
        "Why don't Bitcoin investors want to go to heaven? They hate it when things go up and never come back down.",
        "Why was the cryptocurrency investor always calm? Because they were HODLing their breath.",
        "What do you call a cryptocurrency investor who finally sells? Bitconned.",
        "I told my wife I was investing all our money in crypto. She was so shocked, she was speechless for a whole Bitcoin transaction confirmation time."
      ];
      speakText(jokes[Math.floor(Math.random() * jokes.length)]);
    }
    // Thank you responses
    else if (lowerText.includes('thank you') || lowerText.includes('thanks')) {
      const responses = [
        "You're welcome. I'm here anytime you need cryptocurrency insights.",
        "Happy to help. Feel free to ask about any cryptocurrency you're interested in.",
        "My pleasure. I'm always ready to provide market analysis when you need it."
      ];
      speakText(responses[Math.floor(Math.random() * responses.length)]);
    }
    // Goodbye responses
    else if (lowerText.includes('goodbye') || lowerText.includes('bye') || lowerText.includes('see you')) {
      const responses = [
        "Goodbye. I'll be here when you need more cryptocurrency analysis.",
        "Until next time. Remember, markets change quickly, so check back for updated analysis.",
        "Farewell. I'll keep monitoring the crypto markets while you're away."
      ];
      speakText(responses[Math.floor(Math.random() * responses.length)]);
    }
    // Default response for unrecognized queries
    else {
      speakText("I'm not sure I understand. I'm specialized in cryptocurrency analysis. You can ask me about Bitcoin, Ethereum, or other major cryptocurrencies, or ask me who I am or how I'm doing.");
    }
  };

  // Initialize voices when component mounts
  useEffect(() => {
    // Load voices on component mount
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    
    loadVoices();
    
    // Chrome requires this event listener to get all voices
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Start listening automatically when component mounts
  useEffect(() => {
    if (autoListening && browserSupportsSpeechRecognition) {
      SpeechRecognition.startListening({ continuous: true });
      setListening(true);
    }
    
    return () => {
      SpeechRecognition.stopListening();
    };
  }, [autoListening, browserSupportsSpeechRecognition]);

  // Process voice commands
  useEffect(() => {
    if (!listening || !transcript) return;
    if (processingCommand.current) return; // Skip if already processing a command

    const processCommand = async () => {
      const lowerTranscript = transcript.toLowerCase();
      console.log("Processing transcript:", lowerTranscript); // Debug log
      
      // Check for wake word "Jarvis"
      if (lowerTranscript.includes('jarvis')) {
        setWakeWordDetected(true);
        
        // Reset wake word detection after 10 seconds
        if (wakeWordTimer.current) {
          clearTimeout(wakeWordTimer.current);
        }
        
        wakeWordTimer.current = setTimeout(() => {
          setWakeWordDetected(false);
        }, 10000); // 10 seconds
      }
      
      // Check for conversation queries first
      if (lowerTranscript.includes('who are you') || 
          lowerTranscript.includes('what are you') ||
          lowerTranscript.includes('how are you') ||
          lowerTranscript.includes('what can you do') ||
          lowerTranscript.includes('your name') ||
          lowerTranscript.includes('what time') ||
          lowerTranscript.includes('what day') ||
          lowerTranscript.includes('weather') ||
          lowerTranscript.includes('joke') ||
          lowerTranscript.includes('funny') ||
          lowerTranscript.includes('goodbye') ||
          lowerTranscript.includes('bye') ||
          lowerTranscript.includes('see you')) {
        handleConversation(lowerTranscript);
        resetTranscript();
        return;
      }
      
      // Process commands even without wake word for testing
      // Check for cryptocurrency mentions
      const cryptoKeywords = [
        'bitcoin', 'btc', 'ethereum', 'eth', 'binance coin', 'bnb', 
        'cardano', 'ada', 'solana', 'sol', 'ripple', 'xrp',
        'dogecoin', 'doge', 'polkadot', 'dot', 'avalanche', 'avax',
        'shiba inu', 'shib', 'litecoin', 'ltc', 'chainlink', 'link',
        'polygon', 'matic'
      ];
      
      for (const keyword of cryptoKeywords) {
        if (lowerTranscript.includes(keyword)) {
          console.log("Crypto keyword detected:", keyword); // Debug log
          processingCommand.current = true; // Set processing flag
          await fetchCryptoData(keyword);
          resetTranscript();
          return;
        }
      }
      
      // Handle other commands
      if (lowerTranscript.includes('hello jarvis') || lowerTranscript.includes('hi jarvis') || 
          lowerTranscript.includes('hello') || lowerTranscript.includes('hi')) {
        processingCommand.current = true; // Set processing flag
        setLastInteraction('conversation');
        speakText("Hello, I am Jarvis, your cryptocurrency analysis assistant. You can ask me about various cryptocurrencies like Bitcoin or Ethereum, or ask me questions like 'How are you?' or 'Who are you?'");
        resetTranscript();
      } else if (lowerTranscript.includes('thank you') || lowerTranscript.includes('thanks')) {
        processingCommand.current = true; // Set processing flag
        setLastInteraction('conversation');
        speakText("You're welcome. I'm here to help with your cryptocurrency analysis needs.");
        resetTranscript();
      } else if (lowerTranscript.includes('help')) {
        processingCommand.current = true; // Set processing flag
        setLastInteraction('conversation');
        speakText("I can provide you with 24-hour analysis of various cryptocurrencies. Just say a cryptocurrency name like Bitcoin or Ethereum, and I'll fetch the latest data and provide an analysis. You can also ask me general questions like 'How are you?' or 'Who are you?'");
        resetTranscript();
      } else if (lowerTranscript.includes('stop listening')) {
        processingCommand.current = true; // Set processing flag
        setLastInteraction('conversation');
        setAutoListening(false);
        SpeechRecognition.stopListening();
        setListening(false);
        speakText("I've stopped listening. Click the microphone button when you want me to listen again.");
        resetTranscript();
      }
    };

    // Process command immediately for better responsiveness
    processCommand();
    
  }, [transcript, listening, fetchCryptoData, resetTranscript, wakeWordDetected]);

  // Toggle listening state
  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      setListening(false);
      setAutoListening(false);
    } else {
      SpeechRecognition.startListening({ continuous: true });
      setListening(true);
      setAutoListening(true);
      resetTranscript();
    }
  };

  // Prepare chart data
  const chartData = {
    labels: historicalPrices.map(item => {
      const date = new Date(item.time);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: cryptoData ? cryptoData.symbol.replace('USDT', '') + ' Price (USD)' : 'Price',
        data: historicalPrices.map(item => item.price),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: false,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(59, 130, 246, 0.5)',
        borderWidth: 1,
      },
    },
  };

  // Check if browser supports speech recognition
  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold mb-4">Jarvis AI</h1>
        <p className="text-xl text-red-400">
          Your browser doesn't support speech recognition. Please try using Chrome or Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Jarvis AI</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-400">
            {wakeWordDetected ? (
              <span className="text-green-400">Wake word detected</span>
            ) : (
              <span>Say "Bitcoin", "How are you?", etc.</span>
            )}
          </div>
          <button
            onClick={toggleListening}
            className={`p-3 rounded-full ${listening ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} transition-colors`}
            title={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        </div>
      </header>

      <main className="w-full max-w-4xl flex-1 flex flex-col items-center">
        {/* Jarvis GIF - shown when speaking - now in a circular container */}
        <div className="flex-1 flex items-center justify-center w-full">
          {speaking && (
            <div className="relative">
              <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-blue-500 shadow-lg shadow-blue-500/50 flex items-center justify-center bg-black">
                <img 
                  src="https://i.pinimg.com/originals/42/78/76/42787621ed6d40f0c30f0ae423fc572c.gif" 
                  alt="Jarvis AI" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 left-0 right-0 flex justify-center">
                <div className="bg-blue-900 rounded-full p-2 shadow-md">
                  <Volume2 size={24} className="text-blue-400 animate-pulse" />
                </div>
              </div>
            </div>
          )}
          
          {!speaking && !loading && !cryptoData && lastInteraction !== 'conversation' && (
            <div className="text-center p-8 bg-gray-800 rounded-lg">
              <p className="text-xl mb-4">Say a cryptocurrency name like "Bitcoin" or "Ethereum"</p>
              <p className="text-gray-400">Or ask me questions like "How are you?" or "Who are you?"</p>
            </div>
          )}
          
          {loading && (
            <div className="text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-400 border-r-transparent"></div>
              <p className="mt-4">Fetching data...</p>
            </div>
          )}
          
          {!speaking && !loading && cryptoData && lastInteraction === 'crypto' && (
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl">
              <h2 className="text-2xl font-bold mb-4">{cryptoData.symbol.replace('USDT', '')} Analysis</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-gray-400 text-sm">Current Price</p>
                  <p className="text-xl font-semibold">${parseFloat(cryptoData.lastPrice).toFixed(2)}</p>
                </div>
                
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-gray-400 text-sm">24h Change</p>
                  <p className={`text-xl font-semibold ${parseFloat(cryptoData.priceChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(cryptoData.priceChange).toFixed(2)} ({cryptoData.priceChangePercent}%)
                  </p>
                </div>
                
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-gray-400 text-sm">24h High</p>
                  <p className="text-xl font-semibold">${parseFloat(cryptoData.highPrice).toFixed(2)}</p>
                </div>
                
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-gray-400 text-sm">24h Low</p>
                  <p className="text-xl font-semibold">${parseFloat(cryptoData.lowPrice).toFixed(2)}</p>
                </div>
                
                <div className="bg-gray-700 p-3 rounded col-span-2">
                  <p className="text-gray-400 text-sm">24h Volume</p>
                  <p className="text-xl font-semibold">${(parseFloat(cryptoData.volume) / 1000000).toFixed(2)}M</p>
                </div>
              </div>
              
              {/* Price Chart */}
              {historicalPrices.length > 0 && (
                <div className="mt-6 bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">7-Day Price Chart</h3>
                  <div className="h-64">
                    <Line data={chartData} options={chartOptions} />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {!speaking && !loading && lastInteraction === 'conversation' && !cryptoData && (
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-2xl text-center">
              <h2 className="text-2xl font-bold mb-4">Jarvis AI Assistant</h2>
              <p className="text-lg mb-4">I'm your cryptocurrency analysis assistant.</p>
              <p className="text-gray-400">You can ask me about cryptocurrencies or chat with me about various topics.</p>
            </div>
          )}
          
          {error && (
            <div className="mt-4 p-4 bg-red-900/50 text-red-200 rounded-lg">
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Transcript display */}
        {listening && (
          <div className="w-full max-w-2xl mt-8 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <Mic size={16} className="mr-2 text-red-400 animate-pulse" />
              Listening...
            </h3>
            <p className="text-gray-300">{transcript || "Say something..."}</p>
          </div>
        )}
      </main>

      <footer className="w-full max-w-4xl mt-8 text-center text-gray-500 text-sm">
        <p>Jarvis AI Crypto Assistant &copy; 2025 Eser Software. All rights reserved.</p>
        
      </footer>
    </div>
  );
}

export default App;