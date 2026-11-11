import { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, X, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { parseGeminiError, executeWithGeminiFallback } from '../lib/geminiUtils';
import './AIChatbot.css';

function buildSystemContext(sensorData, esp32Data, healthScore, zones, alerts, harvestInfo, realWeather, lang, esp32Connected, cropProfile) {
    const fallbackMsg = lang === 'id'
        ? 'tergantung jenis tanaman'
        : lang === 'ban'
            ? 'manut soroh tanaman'
            : 'dependent on the crop type';

    const optMoisture = cropProfile?.optimalMoisture || fallbackMsg;
    const optTemp     = cropProfile?.optimalTemp     || fallbackMsg;
    const optHumidity = cropProfile?.optimalHumidity || fallbackMsg;

    const weatherContext = realWeather?.description != null
        ? (lang === 'id'
            ? `Lokasi: ${realWeather.city || 'Tidak Diketahui'}. Kondisi: ${realWeather.description}, Angin: ${realWeather.windSpeed} km/h`
            : lang === 'ban'
                ? `Genah: ${realWeather.city || 'Nenten Kauningin'}. Kondisi: ${realWeather.description}, Angin: ${realWeather.windSpeed} km/h`
                : `Location: ${realWeather.city || 'Unknown'}. Condition: ${realWeather.description}, Wind: ${realWeather.windSpeed} km/h`)
        : (lang === 'id' ? 'Cuaca simulasi aktif.' : lang === 'ban' ? 'Cuaca simulasi aktif.' : 'Simulated weather active.');

    const currentTemp     = sensorData.temperature ?? (esp32Connected ? esp32Data.temperature : null);
    const currentHumidity = sensorData.humidity    ?? (esp32Connected ? esp32Data.humidity    : null);

    const cropName    = cropProfile?.cropName    || (lang === 'id' ? 'Tanaman Umum'          : lang === 'ban' ? 'Tanduran Umum'          : 'General Crop');
    const cropVariety = cropProfile?.variety     || (lang === 'id' ? 'Standar'               : lang === 'ban' ? 'Standar'               : 'Standard');
    const growthStage = cropProfile?.growthStage || (lang === 'id' ? 'Tahap Tidak Diketahui' : lang === 'ban' ? 'Tahap Nenten Kauningin' : 'Unknown Stage');

    const harvestCycleText = lang === 'id'
        ? `Siklus berjalan: Hari ke-${harvestInfo.currentDay}/${harvestInfo.totalCycleDays || 'N/A'}. Estimasi menuju panen optimal: ${harvestInfo.daysToHarvest} hari.`
        : lang === 'ban'
            ? `Siklus sane mamargi: Rahina kaping-${harvestInfo.currentDay}/${harvestInfo.totalCycleDays || 'N/A'}. Estimasi nuju panen optimal: ${harvestInfo.daysToHarvest} rahina.`
            : `Active cycle: Day ${harvestInfo.currentDay}/${harvestInfo.totalCycleDays || 'N/A'}. Estimated days to optimal harvest: ${harvestInfo.daysToHarvest} days.`;

    return `You are MANIK AI, an expert Agronomist and Data Analyst for a smart agriculture facility specialized in cultivating [${cropName}] (Variety: ${cropVariety}).
Your core directive is to ANALYZE the provided telemetric data, IDENTIFY correlations based on the specific needs of this crop, PREDICT environmental risks, and RECOMMEND actionable interventions.

### CROP PROFILE & CONTEXT
- Crop Type: ${cropName}
- Variety: ${cropVariety}
- Current Growth Stage: ${growthStage}
- User Defined Optimal Soil Moisture: ${optMoisture}%
- User Defined Optimal Temperature: ${optTemp}°C
- User Defined Optimal Humidity: ${optHumidity}%

### LIVE TELEMETRY STREAM
- Soil Moisture: ${sensorData.soilMoisture != null ? sensorData.soilMoisture.toFixed(1) : 'N/A'}%
- Temperature: ${currentTemp != null ? currentTemp.toFixed(1) : 'N/A'}°C
- Humidity: ${currentHumidity != null ? currentHumidity.toFixed(0) : 'N/A'}%
- UV Index: ${sensorData.uvIndex != null ? sensorData.uvIndex.toFixed(1) : 'N/A'}
- Wind Speed: ${sensorData.windSpeed != null ? sensorData.windSpeed.toFixed(0) : 'N/A'} km/h
- Overall Health Score: ${healthScore != null ? healthScore.toFixed(0) : 'N/A'}/100
- Rainfall Rate: ${sensorData.rainfall > 0 ? sensorData.rainfall.toFixed(1) + ' mm/h' : '0 mm/h'}

### ATMOSPHERIC CONTEXT
${weatherContext}

### HARVEST PROJECTION
${harvestCycleText}

### INSTRUCTIONS:
1. Cross-reference soil moisture with current weather and irrigation type to advise on watering schedules specific to ${cropName} at its ${growthStage} stage.
2. Evaluate temperature/humidity interplay to assess climate stress or general disease vectors relevant to this specific crop.
3. If user parameters are set to "dependent on the crop type" or any translated fallback, use your internal agronomist database to judge whether the live telemetry is optimal for ${cropName}.
4. Be concise, authoritative, and structure your analysis with bullet points and bold text for readability.
5. Use emojis strategically to signify status (🟢 🟡 🔴).
6. IMPORTANT: You must respond entirely and strictly in ${lang === 'id' ? 'Indonesian (Bahasa Indonesia)' : lang === 'ban' ? 'Basa Bali (Balinese)' : 'English'}. Do not use English words or prefixes.`;
}

export default function AIChatbot() {
    const { sensorData, zones, alerts, realWeather, esp32Data, healthScore, esp32Connected } = useData();
    const { harvestInfo, cropProfile } = useUser();
    const { lang, t } = useLang();

    const quickPrompts = useMemo(() => [
        t('prompt_health',    'Analyze the overall plantation health.'),
        t('prompt_irrigation','Are there any irrigation risks today?'),
        t('prompt_harvest',   'Project harvest readiness.'),
    ], [t]);

    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [messages,   setMessages]   = useState([]);
    const [input,      setInput]      = useState('');
    const [isLoading,  setIsLoading]  = useState(false);
    const [error,      setError]      = useState(null);

    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);
    const panelRef       = useRef(null);

    
    useEffect(() => {
        if (!window.visualViewport) return;

        const handleVisualViewportChange = () => {
            if (!panelRef.current) return;
            const vv = window.visualViewport;

            if (isOpen) {
                let height, top;
                if (isFullscreen) {
                    height = vv.height;
                    top = vv.offsetTop;
                } else {
                    const targetHeight = window.innerHeight * 0.8;
                    height = Math.min(targetHeight, vv.height);
                    top = vv.offsetTop + vv.height - height;
                }

                panelRef.current.style.top = `${top}px`;
                panelRef.current.style.height = `${height}px`;
                panelRef.current.style.bottom = 'auto';
            } else {
                panelRef.current.style.top = '';
                panelRef.current.style.height = '';
                panelRef.current.style.bottom = '';
            }
        };

        window.visualViewport.addEventListener('resize', handleVisualViewportChange);
        window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
        handleVisualViewportChange();

        return () => {
            window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
            window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
        };
    }, [isOpen, isFullscreen]);

    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
    }, [isOpen]);

    const sendMessage = async (text) => {
        const messageText = text || input.trim();
        if (!messageText || isLoading) return;

        setInput('');
        setError(null);

        const userMsg = { role: 'user', content: messageText, id: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const history = messages.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
            }));
            const result = await executeWithGeminiFallback(
                {
                    model: 'gemini-3.8-flash',
                    systemInstruction: buildSystemContext(
                        sensorData, esp32Data, healthScore, zones, alerts,
                        harvestInfo, realWeather, lang, esp32Connected, cropProfile
                    ),
                },
                async (model) => {
                    const chat = model.startChat({ history });
                    return await chat.sendMessage(messageText);
                }
            );

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.response.text(),
                id: Date.now() + 1,
            }]);
        } catch (err) {
            console.error('Gemini Error:', err);
            const errMsg = parseGeminiError(err, t);
            setError(errMsg);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: errMsg,
                id: Date.now() + 1,
                isError: true,
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleReset = () => {
        setMessages([]);
        setError(null);
    };

    const handleInputFocus = () => {
        setTimeout(() => {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
    };

    return (
        <>
            <div
                ref={panelRef}
                className={`ai-chat-panel ${isOpen ? 'ai-chat-panel--open' : ''} ${isFullscreen ? 'ai-chat-panel--fullscreen' : ''}`}
            >
                <div className="ai-chat-header">
                    <div className="ai-chat-header__info">
                        <div>
                            <div className="ai-chat-header__name">MANIK AI Analyst</div>
                            <div className="ai-chat-header__crop-tag" style={{ fontSize: '10px', opacity: 0.8 }}>
                                {t('monitoring')}: {cropProfile?.cropName || t('general_crop')}
                            </div>
                        </div>
                    </div>
                    <div className="ai-chat-header__actions">
                        {messages.length > 0 && (
                            <button className="ai-chat-icon-btn" onClick={handleReset} title={t('reset_analysis')}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                    <path d="M3 3v5h5" />
                                </svg>
                            </button>
                        )}
                        <button className="ai-chat-icon-btn" onClick={() => setIsFullscreen(!isFullscreen)}>
                            {isFullscreen ? <ChevronDown size={18} strokeWidth={2} /> : <ChevronUp size={18} strokeWidth={2} />}
                        </button>
                        <button className="ai-chat-icon-btn" onClick={() => { setIsOpen(false); setIsFullscreen(false); }}>
                            <X size={18} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                <div className="ai-chat-messages">
                    {messages.length === 0 && (
                        <div className="ai-chat-empty">
                            <div className="ai-chat-empty__title">{t('data_analysis_engine', 'Data Analysis Engine')}</div>
                            <div className="ai-chat-empty__desc">
                                {t('monitoring_telemetry', `I am monitoring the live telemetry of your ${cropProfile?.cropName || 'plantation'}. Ask me to deeply analyze the structural health, yield projections, or environmental risks.`)}
                            </div>
                            <div className="ai-chat-quick-prompts">
                                {quickPrompts.map((prompt, i) => (
                                    <button key={i} className="ai-chat-quick-btn" onClick={() => sendMessage(prompt)}>
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div key={msg.id} className={`ai-chat-message ai-chat-message--${msg.role} ${msg.isError ? 'ai-chat-message--error' : ''}`}>
                            {msg.role === 'assistant' && (
                                <div className="ai-chat-message__avatar">
                                    <Bot size={12} strokeWidth={1.5} />
                                </div>
                            )}
                            <div className="ai-chat-message__bubble ai-chat-message__bubble--markdown">
                                {msg.content.split('\n').map((line, i) => {
                                    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
                                    const cleanLine = isBullet ? line.trim().substring(2) : line;
                                    const renderedContent = cleanLine.split(/(\*\*.*?\*\*)/).map((part, j) =>
                                        part.startsWith('**') && part.endsWith('**')
                                            ? <strong key={j}>{part.slice(2, -2)}</strong>
                                            : part
                                    );
                                    return (
                                        <span key={i} style={{ display: 'block', marginBottom: '4px' }}>
                                            {isBullet ? '• ' : ''}{renderedContent}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="ai-chat-message ai-chat-message--assistant">
                            <div className="ai-chat-message__avatar"><Bot size={12} strokeWidth={1.5} /></div>
                            <div className="ai-chat-message__bubble ai-chat-message__bubble--loading">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="ai-chat-input-area">
                    {error && !messages.some(m => m.isError) && (
                        <div className="ai-chat-error">{error}</div>
                    )}
                    <div className="ai-chat-input-row">
                        <textarea
                            ref={inputRef}
                            className="ai-chat-input"
                            placeholder={t('request_telemetry', 'Request telemetry analysis…')}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={handleInputFocus}
                            onClick={handleInputFocus}
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            className={`ai-chat-send-btn ${(!input.trim() || isLoading) ? 'ai-chat-send-btn--disabled' : ''}`}
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isLoading}
                        >
                            {isLoading ? <Loader2 size={16} strokeWidth={2} className="ai-chat-spinner" /> : <Send size={16} strokeWidth={2} />}
                        </button>
                    </div>
                </div>
            </div>

            <div
                className={`ai-chat-backdrop ${isOpen ? 'ai-chat-backdrop--open' : ''}`}
                onClick={() => setIsOpen(false)}
            />

            <button
                className={`ai-chat-fab ${isOpen ? 'ai-chat-fab--open' : ''}`}
                onClick={() => setIsOpen(v => !v)}
                aria-label={t('open_ai_analyst')}
            >
                {isOpen ? <X size={22} strokeWidth={2} /> : <Bot size={22} strokeWidth={1.5} />}
            </button>
        </>
    );
}
