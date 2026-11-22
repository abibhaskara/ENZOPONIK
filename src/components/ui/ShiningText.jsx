import './ShiningText.css';

export function ShiningText({ text, className = '' }) {
  return <span className={`shining-text shining-text--animated ${className}`}>{text}</span>;
}

export default ShiningText;
