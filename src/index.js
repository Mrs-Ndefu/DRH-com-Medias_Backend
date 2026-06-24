require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    cb(new Error('CORS non autorisé'));
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/agents',       require('./routes/agents'));
app.use('/api/organisation', require('./routes/organisation'));
app.use('/api/conges',       require('./routes/conges'));
app.use('/api/presences',    require('./routes/presences'));
app.use('/api/payroll',      require('./routes/payroll'));
app.use('/api/recruitment',  require('./routes/recruitment'));
app.use('/api/dashboard',    require('./routes/dashboard'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/archives',     require('./routes/archives'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SIRH Backend démarré sur http://localhost:${PORT}`));
