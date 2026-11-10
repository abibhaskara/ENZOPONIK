import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion'; 
import { LayoutDashboard, Settings, FileText } from 'lucide-react';
import { useNavDirection } from '../App';
import { useLang } from '../context/LanguageContext';
import './LivingNavbar.css';

const navItems = [
    { labelKey: 'nav_dashboard', path: '/', icon: LayoutDashboard },
    { labelKey: 'nav_analysis', path: '/analysis', icon: FileText },
    { labelKey: 'nav_settings', path: '/settings', icon: Settings },
];

const springConfig = { type: 'spring', stiffness: 300, damping: 30 };

export default function LivingNavbar() {
    const [hoveredPath, setHoveredPath] = useState(null);
    const [isMobile, setIsMobile] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { onNavChange } = useNavDirection();
    const { t } = useLang();

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const getHoverOffset = (itemPath) => {
        if (!hoveredPath) return 0;
        const hoveredIndex = navItems.findIndex((i) => i.path === hoveredPath);
        const currentIndex = navItems.findIndex((i) => i.path === itemPath);
        if (hoveredIndex === -1) return 0;

        
        if (currentIndex < hoveredIndex) return -5; 
        if (currentIndex > hoveredIndex) return 5;  
        return 0; 
    };

    return (
        <motion.nav
            className="living-navbar"
            onMouseLeave={() => setHoveredPath(null)}
        >
            <div className="living-navbar__inner">
                {navItems.map((item) => {
                    const offset = getHoverOffset(item.path);
                    const isHovered = hoveredPath === item.path;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.path}
                            className="living-navbar__link"
                            onMouseEnter={() => setHoveredPath(item.path)}
                            onClick={() => {
                                onNavChange(item.path);
                                navigate(item.path);
                            }}
                            style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                            <div className="living-navbar__item-container">
                                    <motion.div
                                        className={`living-navbar__item ${
                                            location.pathname === item.path ? 'living-navbar__item--active' : ''
                                        }`}
                                        animate={{
                                            x: offset,
                                            scale: isHovered ? 1.1 : 1,
                                            filter: 'blur(0px)',
                                        }}
                                        whileTap={{ scale: 0.95, filter: 'blur(2px)' }}
                                        transition={springConfig}
                                    >
                                        <Icon size={20} className="living-navbar__icon" />

                                        <motion.span
                                            className="living-navbar__label"
                                            animate={{
                                                width: isMobile
                                                    ? location.pathname === item.path ? 'auto' : 0
                                                    : 'auto',
                                                opacity: isMobile
                                                    ? location.pathname === item.path ? 1 : 0
                                                    : 1,
                                                marginLeft: isMobile
                                                    ? location.pathname === item.path ? 6 : 0
                                                    : 6,
                                            }}
                                            transition={springConfig}
                                        >
                                            {t(item.labelKey)}
                                        </motion.span>
                                    </motion.div>

                                    {location.pathname === item.path && (
                                        <motion.div
                                            layoutId="activePill"
                                            className="living-navbar__pill"
                                            transition={springConfig}
                                        />
                                    )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </motion.nav>
    );
}
