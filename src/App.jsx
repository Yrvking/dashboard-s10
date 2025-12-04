import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  LineChart, Line, ComposedChart, Area 
} from 'recharts';
import { 
  Calculator, AlertCircle, TrendingUp, DollarSign, FileText, 
  Briefcase, Search, Filter, ChevronDown, ChevronUp, Users 
} from 'lucide-react';

// --- DATA MOCK (Simulando la estructura de tu CSV S10) ---
const INITIAL_DATA = [
  {
    id: 1,
    subcontratista: '2 A INGENIEROS S.A.C.',
    especialidad: 'INSTALACIONES ELÉCTRICAS',
    n_contrato: '001',
    orden_servicio: 'OS-2025-001',
    contratado: 150000.0,
    costo_directo: 120000.0,
    avance_pct: 80.0,
    n_valorizacion: 'Val 04',
    estado: 'Aprobado',
    comentarios:
      'TRABAJOS EN PISO 14 Y 15 ESTA SIENDO EJECUTADO POR OTRO PROVEEDOR. Se requiere liberar frente.',
    fecha: '2025-10-12',
    monto_costo_directo_os: 150000.0 / 1.18,
  },
  {
    id: 2,
    subcontratista: 'CONSTRUCTORA GLOBAL S.A.',
    especialidad: 'ESTRUCTURAS METÁLICAS',
    n_contrato: '003',
    orden_servicio: 'OS-2025-042',
    contratado: 36842.72,
    costo_directo: 19570.82,
    avance_pct: 53.12,
    n_valorizacion: 'Semana 41',
    estado: 'Observado',
    comentarios: 'Retraso en entrega de materiales. Pendiente firma de adenda.',
    fecha: '2025-10-20',
    monto_costo_directo_os: 36842.72 / 1.18,
  },
  {
    id: 3,
    subcontratista: 'CONSTRUCTORA GLOBAL S.A.',
    especialidad: 'ESTRUCTURAS METÁLICAS',
    n_contrato: '003',
    orden_servicio: 'OS-2025-042',
    contratado: 36842.72,
    costo_directo: 23093.57,
    avance_pct: 62.68,
    n_valorizacion: 'Semana 43',
    estado: 'Aprobado',
    comentarios: 'Regularización de metrados.',
    fecha: '2025-10-26',
    monto_costo_directo_os: 36842.72 / 1.18,
  },
  {
    id: 4,
    subcontratista: 'SERVICIOS GENERALES PERU',
    especialidad: 'DRYWALL Y PINTURA',
    n_contrato: '005',
    orden_servicio: 'OS-2025-088',
    contratado: 85000.0,
    costo_directo: 12500.0,
    avance_pct: 14.7,
    n_valorizacion: 'Val 01',
    estado: 'En Proceso',
    comentarios: 'Inicio de obra. Sin observaciones mayores.',
    fecha: '2025-11-03',
    monto_costo_directo_os: 85000.0 / 1.18,
  },
  {
    id: 5,
    subcontratista: 'TECH SOLUTIONS SAC',
    especialidad: 'SISTEMA CONTRA INCENDIOS',
    n_contrato: '012',
    orden_servicio: 'OS-2025-102',
    contratado: 210000.0,
    costo_directo: 199500.0,
    avance_pct: 95.0,
    n_valorizacion: 'Val Final',
    estado: 'Cierre',
    comentarios: 'Pendiente entrega de dossier de calidad para cierre.',
    fecha: '2025-11-09',
    monto_costo_directo_os: 210000.0 / 1.18,
  },
];

// --- COMPONENTES UI ---

const Card = ({ title, value, icon: Icon, subtext, color = 'blue' }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-start justify-between transition-all hover:shadow-md border-l-4 ${
      color === 'blue'
        ? 'border-l-blue-600'
        : color === 'green'
        ? 'border-l-emerald-500'
        : 'border-l-amber-500'
    }`}
  >
    <div>
      <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">
        {title}
      </p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      {subtext && <p className="text-xs text-slate-400 mt-2">{subtext}</p>}
    </div>
    <div
      className={`p-3 rounded-lg ${
        color === 'blue'
          ? 'bg-blue-50 text-blue-600'
          : color === 'green'
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-amber-50 text-amber-600'
      }`}
    >
      <Icon size={24} />
    </div>
  </div>
);

const Badge = ({ children, type }) => {
  const styles = {
    Aprobado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    Observado: 'bg-red-100 text-red-800 border-red-200',
    'En Proceso': 'bg-blue-100 text-blue-800 border-blue-200',
    Cierre: 'bg-purple-100 text-purple-800 border-purple-200',
    default: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium border ${
        styles[type] || styles.default
      }`}
    >
      {children}
    </span>
  );
};

// --- UTILS ---
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(amount || 0);
};

const formatPct = (num) => {
  const n = Number(num || 0);
  return `${n.toFixed(2)}%`;
};

// Limpieza y helpers para el parser
const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/\s+/g, ' ');
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const num = Number(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

const isOsRow = (desc) => {
  const d = normalizeText(desc).toUpperCase();
  return (
    d.startsWith('OS ') ||
    d.startsWith('O.S.') ||
    d.startsWith('OC ') ||
    d.startsWith('O.C.')
  );
};

const isSemanaRow = (desc) => {
  return normalizeText(desc).toUpperCase().startsWith('SEMANA ');
};

const extractOsFromDescription = (desc) => {
  const d = normalizeText(desc);
  const match = d.match(/(O\.?S\.?|O\.?C\.?|OS|OC)\s*0*([0-9]+)/i);
  if (!match) return '';
  const num = match[2].padStart(4, '0');
  return `O.S. ${num}`;
};

const extractSubcontractName = (desc) => {
  const d = normalizeText(desc);
  const idx = d.indexOf('-');
  if (idx === -1) return d;
  return normalizeText(d.slice(idx + 1));
};

// Parser para el layout Subcontratos_Administrador.xlsx
const parseSubcontratosAdministrador = (matrix) => {
  if (!matrix || matrix.length < 3) return [];

  const header1 = matrix[1] || [];
  const header2 = matrix[2] || [];

  const findCol = (matcher) => {
    for (let i = 0; i < header1.length; i++) {
      const h1 = normalizeText(header1[i]);
      const h2 = normalizeText(header2[i]);
      if (matcher(h1, h2, i)) return i;
    }
    return -1;
  };

  const idxDesc = findCol((h1) => h1 === 'Descripción');
  const idxEsp = findCol((h1) => h1 === 'Especialidad');
  const idxContratado = findCol((h1) => h1.startsWith('Contratado'));
  const idxValPct = findCol((h1, h2) => h1.startsWith('Valorizado') && h2 === '%');
  const idxCostoDirecto = findCol((h1, h2) => h2 === 'Costo Directo');
  const idxAdelCalc = findCol(
    (h1, h2) => h1.startsWith('Adelantos') && h2 === 'Calculado'
  );
  const idxPendientePor = findCol((h1) => h1.startsWith('Pendiente por'));
  const idxOCOS = findCol((h1) => h1.startsWith('N° O.C. / O.S.'));

  const idxAdelOtorg = idxAdelCalc !== -1 ? idxAdelCalc + 1 : -1;
  const idxAdelAmort = idxAdelCalc !== -1 ? idxAdelCalc + 2 : -1;

  if (
    idxDesc === -1 ||
    idxContratado === -1 ||
    idxCostoDirecto === -1 ||
    idxValPct === -1 ||
    idxOCOS === -1
  ) {
    return [];
  }

  const result = [];
  let currentProvider = '';

  for (let r = 3; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const rawDesc = row[idxDesc];
    const desc = normalizeText(rawDesc);

    if (!desc) continue;
    if (desc.toUpperCase() === 'SUBCONTRATOS') continue;

    const semana = isSemanaRow(desc);
    const os = isOsRow(desc);

    // Fila proveedor
    if (!semana && !os) {
      currentProvider = desc;
      continue;
    }

    // Fila semana: la ignoramos para resumen por OS
    if (semana) continue;

    // Fila OS
    if (os) {
      const especialidad = idxEsp !== -1 ? normalizeText(row[idxEsp]) : '';
      const contratado = normalizeNumber(row[idxContratado]);
      const costoDirecto = normalizeNumber(row[idxCostoDirecto]);
      const avancePct = normalizeNumber(row[idxValPct]);

      const adelCalc =
        idxAdelCalc !== -1 ? normalizeNumber(row[idxAdelCalc]) : 0;
      const adelOtorg =
        idxAdelOtorg !== -1 ? normalizeNumber(row[idxAdelOtorg]) : 0;
      const adelAmort =
        idxAdelAmort !== -1 ? normalizeNumber(row[idxAdelAmort]) : 0;

      const adelanto = adelOtorg || adelCalc || 0;
      const pendientePor =
        idxPendientePor !== -1 ? normalizeNumber(row[idxPendientePor]) : 0;

      const osCodeRaw = idxOCOS !== -1 ? normalizeText(row[idxOCOS]) : '';
      const osCode = osCodeRaw || extractOsFromDescription(desc);

      result.push({
        proveedor: normalizeText(currentProvider),
        subcontrato_desc: normalizeText(desc),
        subcontrato_nombre: extractSubcontractName(desc),
        especialidad,
        orden_servicio: osCode,
        monto_subcontrato: contratado,
        costo_directo: costoDirecto,
        adelanto_calculado: adelCalc || null,
        adelanto_otorgado: adelOtorg || null,
        adelanto_amortizado: adelAmort || null,
        adelanto: adelanto || null,
        avance_pct: avancePct,
        pendiente_por: pendientePor || null,
        saldo_por_ejecutar:
          contratado && costoDirecto ? contratado - costoDirecto : null,
        saldo_adelanto: adelanto && adelAmort ? adelanto - adelAmort : null,
      });
    }
  }

  // Filtra filas sin proveedor / OS / monto
  return result.filter(
    (r) =>
      r.proveedor &&
      r.orden_servicio &&
      r.monto_subcontrato &&
      r.monto_subcontrato > 0
  );
};

// --- MAIN COMPONENT ---

export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContractor, setSelectedContractor] = useState('all');

  // Simulation State
  const [simulatedId, setSimulatedId] = useState(null);
  const [addedPct, setAddedPct] = useState(0);

  // --- handleExcelImport con parser Subcontratos_Administrador y costo directo OS ---
  const handleExcelImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const dataArray = new Uint8Array(e.target.result);
      const workbook = XLSX.read(dataArray, { type: 'array' });

      const sheetName = workbook.SheetNames.includes('Subcontratos')
        ? 'Subcontratos'
        : workbook.SheetNames.includes('DashboardData')
        ? 'DashboardData'
        : workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];

      // Leemos como matriz para soportar doble encabezado
      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      });

      // Detección más flexible del layout Subcontratos_Administrador
      const looksLikeAdministrador =
        matrix.length >= 3 &&
        (matrix[1] || []).some((cell) => normalizeText(cell) === 'Descripción') &&
        (matrix[1] || []).some((cell) => normalizeText(cell) === '# Val.');

      let parsedDashboardData = [];

      if (looksLikeAdministrador) {
        // Caso: layout Subcontratos_Administrador.xlsx
        const erpRows = parseSubcontratosAdministrador(matrix);

        if (!erpRows.length) {
          alert(
            'No se encontraron registros válidos en el formato de Subcontratos_Administrador. Revisa que el layout no haya cambiado.'
          );
          return;
        }

        parsedDashboardData = erpRows.map((row, index) => {
          const avance = normalizeNumber(row.avance_pct);
          const contratadoConIgv = normalizeNumber(row.monto_subcontrato);
          const estado =
            avance >= 99.9
              ? 'Cierre'
              : avance > 0
              ? 'En Proceso'
              : 'En Elaboración';

          return {
            id: index + 1,
            subcontratista: row.proveedor || '',
            especialidad: row.especialidad || '',
            n_contrato: null, // el ERP no lo entrega
            orden_servicio: row.orden_servicio || '',
            contratado: contratadoConIgv,
            costo_directo: normalizeNumber(row.costo_directo),
            // NUEVO: costo directo OS sin IGV
            monto_costo_directo_os: contratadoConIgv ? contratadoConIgv / 1.18 : 0,
            avance_pct: avance,
            n_valorizacion: null, // no viene a nivel OS en ese layout
            estado,
            comentarios: '',
            fecha: null,

            // Campos adicionales para decisiones
            adelanto: row.adelanto !== null ? normalizeNumber(row.adelanto) : 0,
            adelanto_calculado:
              row.adelanto_calculado !== null
                ? normalizeNumber(row.adelanto_calculado)
                : null,
            adelanto_amortizado:
              row.adelanto_amortizado !== null
                ? normalizeNumber(row.adelanto_amortizado)
                : null,
            pendiente_por:
              row.pendiente_por !== null
                ? normalizeNumber(row.pendiente_por)
                : null,
            saldo_por_ejecutar:
              row.saldo_por_ejecutar !== null
                ? normalizeNumber(row.saldo_por_ejecutar)
                : null,
            saldo_adelanto:
              row.saldo_adelanto !== null
                ? normalizeNumber(row.saldo_adelanto)
                : null,
            subcontrato: row.subcontrato_nombre || row.subcontrato_desc || '',
          };
        });
      } else {
        // Fallback: hoja plana tipo DashboardData (mapeo original)
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        parsedDashboardData = rows
          .map((row, index) => {
            const contratadoConIgv = normalizeNumber(row['Contratado (S/.)']);
            return {
              id: index + 1,
              subcontratista: normalizeText(row['Subcontratista']),
              especialidad: normalizeText(row['Especialidad']),
              n_contrato: row['N° Subcontrato'] || row['Nº Subcontrato'] || null,
              orden_servicio:
                normalizeText(
                  row['N° O.C. / O.S.'] || row['O.S. / Val'] || row['Orden Servicio']
                ) || '',
              contratado: contratadoConIgv,
              costo_directo: normalizeNumber(row['Costo Directo (S/.)']),
              // NUEVO: costo directo OS sin IGV
              monto_costo_directo_os: contratadoConIgv ? contratadoConIgv / 1.18 : 0,
              avance_pct: normalizeNumber(row['% Avance']),
              n_valorizacion: row['Valorización'] || row['Val'] || null,
              estado: row['Estado'] || 'Sin Estado',
              comentarios: row['Comentarios'] || '',
              fecha: row['Fecha'] ? String(row['Fecha']) : null,
            };
          })
          .filter((r) => r.subcontratista && r.orden_servicio);
      }

      if (!parsedDashboardData.length) {
        alert(
          'No se encontraron registros válidos en la hoja seleccionada. Revisa los nombres de las columnas.'
        );
        return;
      }

      setData(parsedDashboardData);
    };

    reader.readAsArrayBuffer(file);
  };

  // --- DERIVED DATA & MEMO ---

  // Filter Data
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.subcontratista.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.orden_servicio.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        selectedContractor === 'all' || item.subcontratista === selectedContractor;
      return matchesSearch && matchesFilter;
    });
  }, [data, searchTerm, selectedContractor]);

  // Unique Contractors for Dropdown
  const contractors = useMemo(
    () => [...new Set(data.map((d) => d.subcontratista))],
    [data]
  );

  // Simulation Logic: solo trabaja sobre filteredData
  const simulationResult = useMemo(() => {
    if (!simulatedId) return null;

    const item = filteredData.find((d) => d.id === parseInt(simulatedId));
    if (!item) return null;

    const currentPct = item.avance_pct || 0;
    const newTotalPct = Math.min(100, currentPct + addedPct); // Cap at 100%
    const newCost = item.contratado * (newTotalPct / 100);
    const deltaCost = newCost - item.costo_directo;

    return {
      item,
      currentPct,
      newTotalPct,
      currentCost: item.costo_directo,
      newCost,
      deltaCost,
    };
  }, [simulatedId, addedPct, filteredData]);

  // Si cambian los filtros y el item simulado ya no está en el resultado, reseteamos el simulador
  useEffect(() => {
    if (!simulatedId) return;

    const exists = filteredData.some((d) => d.id === parseInt(simulatedId));
    if (!exists) {
      setSimulatedId(null);
      setAddedPct(0);
    }
  }, [filteredData, simulatedId]);

  // KPIs Globales
  const kpis = useMemo(() => {
    const totalContratado = filteredData.reduce(
      (acc, curr) => acc + (curr.contratado || 0),
      0
    );
    const totalCosto = filteredData.reduce(
      (acc, curr) => acc + (curr.costo_directo || 0),
      0
    );
    const avgAvance = totalContratado > 0 ? (totalCosto / totalContratado) * 100 : 0;

    return { totalContratado, totalCosto, avgAvance };
  }, [filteredData]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    const grouped = filteredData.reduce((acc, curr) => {
      if (!acc[curr.subcontratista]) {
        acc[curr.subcontratista] = {
          name: curr.subcontratista.split(' ')[0], // Short name
          full_name: curr.subcontratista,
          Contratado: 0,
          Valorizado: 0,
        };
      }
      acc[curr.subcontratista].Contratado = Math.max(
        acc[curr.subcontratista].Contratado,
        curr.contratado || 0
      );
      acc[curr.subcontratista].Valorizado = Math.max(
        acc[curr.subcontratista].Valorizado,
        curr.costo_directo || 0
      );
      return acc;
    }, {});
    return Object.values(grouped);
  }, [filteredData]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-10">
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calculator className="text-emerald-400" />
                Control de Subcontratos & Valorizaciones
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Dashboard de Gestión de Costos y Proyecciones S10
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 text-sm bg-slate-800 py-2 px-4 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-400">Fuente:</span>
                <span className="text-xs font-semibold text-emerald-300">
                  Subcontratos_Administrador.xlsx / DashboardData
                </span>
              </div>

              {/* Botón de importación */}
              <label className="cursor-pointer inline-flex items-center px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow hover:bg-emerald-600 transition">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleExcelImport}
                />
                Importar Excel
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPIs ROW */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            title="Monto Total Contratado"
            value={formatCurrency(kpis.totalContratado)}
            icon={Briefcase}
            color="blue"
            subtext={`${filteredData.length} registros filtrados`}
          />
          <Card
            title="Costo Directo Acumulado"
            value={formatCurrency(kpis.totalCosto)}
            icon={DollarSign}
            color="green"
            subtext="Valorizado a la fecha"
          />
          <Card
            title="Avance Físico Global"
            value={formatPct(kpis.avgAvance)}
            icon={TrendingUp}
            color="amber"
            subtext="Ponderado por monto"
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: FILTERS & SIMULATOR */}
          <div className="space-y-6 lg:col-span-1">
            {/* FILTERS */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Filter size={18} /> Filtros
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-2.5 text-slate-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Proveedor, O.S..."
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Proveedor
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                    value={selectedContractor}
                    onChange={(e) => setSelectedContractor(e.target.value)}
                  >
                    <option value="all">Todos los Proveedores</option>
                    {contractors.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SIMULATOR MODULE */}
            <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg border border-slate-800 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Calculator size={100} />
              </div>

              <h2 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10 text-emerald-400">
                <TrendingUp size={18} /> Simulador de Avance
              </h2>
              <p className="text-slate-400 text-xs mb-4 relative z-10">
                Proyecta el impacto en el Costo Directo aumentando el porcentaje de una valorización específica.
              </p>

              <div className="space-y-4 relative z-10">
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-400 mb-1">
                    Seleccionar Item (Subcontrato/Val)
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:border-emerald-500 outline-none"
                    onChange={(e) => {
                      setSimulatedId(e.target.value);
                      setAddedPct(0);
                    }}
                    value={simulatedId || ''}
                  >
                    <option value="">-- Selecciona para proyectar --</option>
                    {filteredData.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.subcontratista.substring(0, 15)}... -{' '}
                        {item.n_valorizacion || 'Sin Val'} ({item.avance_pct}%)
                      </option>
                    ))}
                  </select>
                </div>

                {simulationResult && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Aumentar Avance:</span>
                        <span className="font-bold text-emerald-400">+{addedPct}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={100 - simulationResult.currentPct}
                        step="1"
                        value={addedPct}
                        onChange={(e) => setAddedPct(Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>Actual: {formatPct(simulationResult.currentPct)}</span>
                        <span>Meta: {formatPct(simulationResult.newTotalPct)}</span>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Costo Actual:</span>
                        <span>{formatCurrency(simulationResult.currentCost)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-emerald-400 font-semibold">
                          Proyectado:
                        </span>
                        <span className="text-emerald-400 font-bold">
                          {formatCurrency(simulationResult.newCost)}
                        </span>
                      </div>
                      <div className="border-t border-slate-700 pt-2 flex justify-between items-center text-xs">
                        <span className="text-amber-400">Delta (A Pagar):</span>
                        <span className="text-amber-400 font-mono">
                          +{formatCurrency(simulationResult.deltaCost)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: MAIN CONTENT */}
          <div className="lg:col-span-2 space-y-6">
            {/* CHART */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-80">
              <h3 className="font-bold text-slate-700 mb-4">
                Avance Financiero por Proveedor
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(val) => `S/ ${(val / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar
                    dataKey="Contratado"
                    fill="#3b82f6"
                    name="Monto Contrato"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Valorizado"
                    fill="#10b981"
                    name="Valorizado (Costo Directo)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* DATA TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileText size={18} className="text-slate-500" />
                  Detalle de Valorizaciones
                </h3>
                <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded">
                  {filteredData.length} registros
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Proveedor / Especialidad</th>
                      <th className="px-4 py-3">O.S. / Val</th>
                      <th className="px-4 py-3 text-right">Contratado (c/ IGV)</th>
                      <th className="px-4 py-3 text-right">
                        Costo Directo OS (s/ IGV)
                      </th>
                      <th className="px-4 py-3 text-center">% Avance</th>
                      <th className="px-4 py-3 text-right">Costo Directo</th>
                      <th className="px-4 py-3 text-right">Adelanto</th>
                      <th className="px-4 py-3 text-right">Amortizado</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredData.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {item.subcontratista}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.especialidad}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs bg-slate-100 w-fit px-1 rounded border border-slate-200 text-slate-600 mb-1">
                            {item.orden_servicio}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.n_valorizacion}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                          {formatCurrency(item.contratado)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                          {formatCurrency(
                            item.monto_costo_directo_os ||
                              (item.contratado ? item.contratado / 1.18 : 0)
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  item.avance_pct >= 90
                                    ? 'bg-emerald-500'
                                    : item.avance_pct >= 50
                                    ? 'bg-blue-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${item.avance_pct}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold">
                              {item.avance_pct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          {formatCurrency(item.costo_directo)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatCurrency(item.adelanto || 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatCurrency(item.adelanto_amortizado || 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge type={item.estado}>{item.estado}</Badge>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="relative group/tooltip cursor-help">
                            <p className="truncate text-slate-500 text-xs italic">
                              <AlertCircle
                                size={12}
                                className="inline mr-1 mb-0.5 text-amber-500"
                              />
                              {item.comentarios || 'Sin comentarios'}
                            </p>
                            <div className="absolute hidden group-hover/tooltip:block z-50 w-64 p-3 bg-slate-800 text-white text-xs rounded shadow-xl -left-20 top-6">
                              {item.comentarios ||
                                'No hay observaciones registradas.'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredData.length === 0 && (
                <div className="p-10 text-center text-slate-400">
                  <p>No se encontraron datos con los filtros actuales.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
