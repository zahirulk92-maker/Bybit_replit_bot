import {NavLink} from 'react-router-dom';
const items=[['/','Dashboard'],['/market-scanner','Market Scanner'],['/signals','Signals'],['/execution','Execution'],['/active-trades','Active Trades'],['/risk-control','Risk Control'],['/journal-logs','Journal / Logs'],['/strategy','Strategy'],['/settings','Settings']];
export default function Sidebar(){return <aside><div className="brand">BYBIT OPS</div>{items.map(([to,n])=><NavLink key={to} to={to} end={to==='/'}>{n}</NavLink>)}</aside>}
