import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Settings, FileText } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import './LivingNavbar.css';

const navItems = [
  { labelKey: 'nav_dashboard', path: '/', icon: LayoutDashboard },
  { labelKey: 'nav_analysis', path: '/analysis', icon: FileText },
  { labelKey: 'nav_settings', path: '/settings', icon: Settings },
];

export default function LivingNavbar() {
  const [hoveredPath, setHoveredPath] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();

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
    <nav className="living-navbar" onMouseLeave={() => setHoveredPath(null)}>
      <div className="living-navbar__inner">
        {navItems.map((item) => {
          const offset = getHoverOffset(item.path);
          const isHovered = hoveredPath === item.path;
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              type="button"
              className="living-navbar__link"
              onMouseEnter={() => setHoveredPath(item.path)}
              onClick={() => navigate(item.path)}
              style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <div className="living-navbar__item-container">
                <div
                  className={`living-navbar__item ${isActive ? 'living-navbar__item--active' : ''}`}
                  style={{
                    transform: `translateX(${offset}px) scale(${isHovered ? 1.1 : 1})`,
                  }}
                >
                  <Icon size={20} className="living-navbar__icon" />
                  <span className="living-navbar__label">{t(item.labelKey)}</span>
                </div>
                {isActive && <div className="living-navbar__pill" />}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
