import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
} from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  Calculator,
  TrendingUp,
  DollarSign,
  FileText,
  Briefcase,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";

// -----------------------------------------------------------------------------
// DATA MOCK INICIAL (fallback si no hay Excel ni localStorage)
// -----------------------------------------------------------------------------
const INITIAL_DATA = [
  {
    id: 1,
    subcontratista: "2 A INGENIEROS S.A.C.",
    especialidad: "INSTALACIONES ELÉCTRICAS",
    n_contrato: "001",
    orden_servicio: "OS-2025-001",
    contratado: 150000,
    costo_directo: 120000,
    monto_costo_directo_os: 150000 / 1.18,
    avance_pct: 80,
    n_valorizacion: "ACUM-VAL 04",
    estado: "En Proceso",
    comentarios: "",
    fecha: "2025-10-12",
    adelanto: 20000,
    adelanto_calculado: 20000,
    adelanto_amortizado: 15000,
    pendiente_por: null,
    saldo_por_ejecutar: null,
    saldo_adelanto: null,
    subcontrato: "INSTALACIONES ELÉCTRICAS PISOS 14 Y 15",
    valorizaciones: [],
    retenido: 5000,
    cerrado: false,
    observacion_manual: "",
  },
];

const LOCAL_STORAGE_KEY = "dashboardSubcontratosData_v3";

// -----------------------------------------------------------------------------
// COMPONENTES UI
// -----------------------------------------------------------------------------
const Card = ({ title, value, icon: Icon, subtext, color = "blue" }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br shadow-sm transition-all hover:shadow-lg ${
      color === "blue"
        ? "from-slate-900 via-slate-800 to-sky-800 text-sky-50"
        : color === "green"
        ? "from-slate-900 via-slate-800 to-emerald-800 text-emerald-50"
        : "from-slate-900 via-slate-800 to-amber-700 text-amber-50"
    }`}
  >
    <div className="absolute -right-6 -top-6 opacity-20">
      <Icon size={72} />
    </div>
    <div className="p-5 relative z-10 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
          {title}
        </p>
        <h3 className="mt-1 text-2xl font-bold">{value}</h3>
        {subtext && (
          <p className="mt-2 text-xs opacity-70 flex items-center gap-1">
            {subtext}
          </p>
        )}
      </div>
      <div className="p-3 rounded-xl bg-black/20">
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const Badge = ({ children, type }) => {
  const styles = {
    Aprobado: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Observado: "bg-red-100 text-red-800 border-red-200",
    "En Proceso": "bg-sky-100 text-sky-800 border-sky-200",
    Cierre: "bg-purple-100 text-purple-800 border-purple-200",
    default: "bg-gray-100 text-gray-800 border-gray-200",
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
        styles[type] || styles.default
      }`}
    >
      {children}
    </span>
  );
};

const TabButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
      active
        ? "border-sky-500 text-sky-500"
        : "border-transparent text-slate-400 hover:text-slate-200"
    }`}
  >
    {children}
  </button>
);

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------
const formatCurrency = (amount) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount || 0);

const formatPct = (num) => `${Number(num || 0).toFixed(2)}%`;

const normalizeText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const isSemanaRow = (txt) =>
  normalizeText(txt).toUpperCase().startsWith("SEMANA ");

const isOsRow = (txt) => {
  const d = normalizeText(txt).toUpperCase();
  if (!d) return false;
  if (d.startsWith("OS ") || d.startsWith("O.S.") || d.startsWith("OS-"))
    return true;
  if (d.startsWith("OC ") || d.startsWith("O.C.")) return true;
  return /O\.?S\.?\s*\d+/i.test(d);
};

const extractOsFromDescription = (desc) => {
  const d = normalizeText(desc);
  const match = d.match(/(O\.?S\.?|O\.?C\.?|OS|OC)[^\d]*0*([0-9]+)/i);
  if (!match) return "";
  const num = match[2].padStart(4, "0");
  return `O.S. ${num}`;
};

const extractSubcontractName = (desc) => {
  const d = normalizeText(desc);
  const idx = d.indexOf("-");
  if (idx === -1) return d;
  return normalizeText(d.slice(idx + 1));
};

const buildRecordKey = (item) =>
  [
    normalizeText(item.subcontratista || "").toUpperCase(),
    normalizeText(item.orden_servicio || "").toUpperCase(),
    normalizeText(item.subcontrato || "").toUpperCase(),
  ].join("||");

// -----------------------------------------------------------------------------
// PARSER SUBCONTRATOS_ADMINISTRADOR
// -----------------------------------------------------------------------------
const parseSubcontratosAdministrador = (matrix) => {
  if (!matrix || matrix.length < 4) return [];

  const header1 = matrix[1] || [];
  const header2 = matrix[2] || [];

  const contains = (txt, token) =>
    txt && txt.toLowerCase().includes(token.toLowerCase());

  const findCol = (matcher) => {
    for (let i = 0; i < header1.length; i += 1) {
      const h1 = normalizeText(header1[i]);
      const h2 = normalizeText(header2[i]);
      if (matcher(h1, h2, i)) return i;
    }
    for (let i = 0; i < header1.length; i += 1) {
      const h1 = normalizeText(header1[i]);
      if (matcher(h1, "", i)) return i;
    }
    for (let i = 0; i < header2.length; i += 1) {
      const h2 = normalizeText(header2[i]);
      if (matcher("", h2, i)) return i;
    }
    return -1;
  };

  const idxDesc = findCol((h1) => h1 === "Descripción");
  const idxEsp = findCol((h1) => h1 === "Especialidad");
  const idxContratado = findCol((h1) => contains(h1, "Contratado"));
  const idxValPct = findCol(
    (h1, h2) =>
      contains(h1, "Valorizado") && (h2 === "%" || contains(h2, "%"))
  );
  const idxCostoDirecto = findCol(
    (h1, h2) =>
      contains(h1, "Costo Directo") || contains(h2, "Costo Directo")
  );
  const idxRetenido = findCol((h1, h2) => contains(h1, "Retenido") || contains(h2, "Retenido"));
  const idxAdelCalc = findCol(
    (h1, h2) =>
      (contains(h1, "Adelanto") || contains(h1, "Adelantos")) &&
      (contains(h2, "Calculado") || contains(h2, "Calc"))
  );
  const idxAdelAmort = findCol(
    (h1, h2) =>
      (contains(h1, "Adelanto") || contains(h1, "Adelantos") || contains(h2, "Adelanto")) &&
      (contains(h2, "Amort") || contains(h1, "Amort"))
  );
  const idxAdelOtorg = findCol(
    (h1, h2) =>
      (contains(h1, "Adelanto") || contains(h1, "Adelantos")) &&
      contains(h2, "Otorg")
  );
  const idxPendientePor = findCol((h1) => contains(h1, "Pendiente por"));
  const idxOCOS = findCol((h1) => contains(h1, "O.C.") || contains(h1, "O.S."));

  if (
    idxDesc === -1 ||
    idxContratado === -1 ||
    idxCostoDirecto === -1 ||
    idxValPct === -1
  ) {
    return [];
  }

  const result = [];
  let currentProvider = "";
  let r = 3;

  while (r < matrix.length) {
    const row = matrix[r] || [];
    const rawDesc = idxDesc < row.length ? row[idxDesc] : null;
    const desc = normalizeText(rawDesc);

    if (!desc) {
      r += 1;
      continue;
    }

    if (desc.toUpperCase() === "SUBCONTRATOS") {
      r += 1;
      continue;
    }

    const semana = isSemanaRow(desc);
    const osRow = isOsRow(desc);

    // fila proveedor
    if (!semana && !osRow) {
      currentProvider = desc;
      r += 1;
      continue;
    }

    // semana se procesa dentro de cada OS
    if (semana) {
      r += 1;
      continue;
    }

    // fila OS
    if (osRow) {
      const especialidad =
        idxEsp !== -1 && idxEsp < row.length
          ? normalizeText(row[idxEsp])
          : "";
      const contratado =
        idxContratado !== -1
          ? normalizeNumber(row[idxContratado])
          : 0;
      const costoDirecto =
        idxCostoDirecto !== -1
          ? normalizeNumber(row[idxCostoDirecto])
          : 0;
      const avancePct =
        idxValPct !== -1 ? normalizeNumber(row[idxValPct]) : 0;
      const adelCalc =
        idxAdelCalc !== -1 ? normalizeNumber(row[idxAdelCalc]) : 0;
      const adelOtorg =
        idxAdelOtorg !== -1 ? normalizeNumber(row[idxAdelOtorg]) : 0;
      const adelAmort =
        idxAdelAmort !== -1 ? normalizeNumber(row[idxAdelAmort]) : 0;
      const retenidoOs =
        idxRetenido !== -1 ? normalizeNumber(row[idxRetenido]) : 0;
      const pendientePor =
        idxPendientePor !== -1
          ? normalizeNumber(row[idxPendientePor])
          : null;

      const osCodeRaw =
        idxOCOS !== -1 && idxOCOS < row.length
          ? normalizeText(row[idxOCOS])
          : "";
      const osCode = osCodeRaw || extractOsFromDescription(desc);

      const contrato = {
        proveedor: normalizeText(currentProvider),
        subcontrato_desc: desc,
        subcontrato_nombre: extractSubcontractName(desc),
        especialidad,
        orden_servicio: osCode,
        monto_subcontrato: contratado,
        costo_directo: costoDirecto,
        adelanto_calculado: adelCalc || null,
        adelanto_otorgado: adelOtorg || null,
        adelanto_amortizado: adelAmort || null,
        adelanto: adelOtorg || adelCalc || 0,
        avance_pct: avancePct,
        pendiente_por: pendientePor,
        saldo_por_ejecutar:
          contratado && costoDirecto ? contratado - costoDirecto : null,
        saldo_adelanto:
          (adelOtorg || adelCalc) && adelAmort
            ? (adelOtorg || adelCalc) - adelAmort
            : null,
        valorizaciones: [],
        retenido_os: retenidoOs,
      };

      // barrer semanas
      r += 1;
      while (r < matrix.length) {
        const row2 = matrix[r] || [];
        const rawDesc2 = idxDesc < row2.length ? row2[idxDesc] : null;
        const desc2 = normalizeText(rawDesc2);

        if (!desc2) {
          r += 1;
          continue;
        }

        if (isSemanaRow(desc2)) {
          const nVal = row2[2] != null ? String(row2[2]) : null;
          const pct =
            idxValPct !== -1 ? normalizeNumber(row2[idxValPct]) : 0;
          const cd =
            idxCostoDirecto !== -1
              ? normalizeNumber(row2[idxCostoDirecto])
              : 0;
          const reten =
            idxRetenido !== -1 ? normalizeNumber(row2[idxRetenido]) : 0;

          contrato.valorizaciones.push({
            n_valorizacion: nVal,
            descripcion: desc2,
            avance_pct: pct,
            costo_directo: cd,
            retenido: reten,
          });

          r += 1;
          continue;
        }

        // siguiente bloque (nuevo proveedor u OS)
        break;
      }

      const retenidoTotal =
        contrato.valorizaciones.length > 0
          ? contrato.valorizaciones.reduce(
              (acc, v) => acc + (v.retenido || 0),
              0
            )
          : contrato.retenido_os || 0;

      contrato.retenido_total = retenidoTotal;

      result.push(contrato);
      continue;
    }

    r += 1;
  }

  return result.filter(
    (item) =>
      item.proveedor &&
      item.orden_servicio &&
      item.monto_subcontrato &&
      item.monto_subcontrato > 0
  );
};

// -----------------------------------------------------------------------------
// ENRIQUECER REGISTRO
// -----------------------------------------------------------------------------
const enrichRecord = (item, idOverride) => ({
  id: idOverride ?? item.id,
  subcontratista: item.subcontratista || "",
  especialidad: item.especialidad || "",
  n_contrato: item.n_contrato ?? null,
  orden_servicio: item.orden_servicio || "",
  contratado: item.contratado || 0,
  costo_directo: item.costo_directo || 0,
  monto_costo_directo_os:
    item.monto_costo_directo_os ??
    (item.contratado ? item.contratado / 1.18 : 0),
  avance_pct: item.avance_pct || 0,
  n_valorizacion: item.n_valorizacion ?? null,
  estado: item.estado || "Sin Estado",
  comentarios: item.comentarios || "",
  fecha: item.fecha || null,
  adelanto: item.adelanto || 0,
  adelanto_calculado:
    item.adelanto_calculado !== undefined
      ? item.adelanto_calculado
      : null,
  adelanto_amortizado:
    item.adelanto_amortizado !== undefined
      ? item.adelanto_amortizado
      : null,
  pendiente_por: item.pendiente_por ?? null,
  saldo_por_ejecutar: item.saldo_por_ejecutar ?? null,
  saldo_adelanto: item.saldo_adelanto ?? null,
  subcontrato: item.subcontrato || "",
  valorizaciones: Array.isArray(item.valorizaciones)
    ? item.valorizaciones
    : [],
  retenido: item.retenido || item.retenido_total || 0,
  cerrado: !!item.cerrado,
  observacion_manual: item.observacion_manual || "",
});

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------
export default function App() {
  const [data, setData] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item, idx) => enrichRecord(item, idx + 1));
          }
        }
      } catch {
        // ignore
      }
    }
    return INITIAL_DATA.map((item, idx) => enrichRecord(item, idx + 1));
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContractor, setSelectedContractor] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [simulatedId, setSimulatedId] = useState("");
  const [targetPct, setTargetPct] = useState(null);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(true);

  const [subSummarySort, setSubSummarySort] = useState({
    field: "monto_contratado",
    direction: "desc",
  });

  const [detailSort, setDetailSort] = useState({
    field: null,
    direction: "asc",
  });

  // scroll “tipo Procore”
  const [scrollMax, setScrollMax] = useState(0);
  const [scrollValue, setScrollValue] = useState(0);

  const bottomScrollRef = useRef(null);

  // Guardar en localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    }
  }, [data]);

  // Import Excel
  const handleExcelImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const dataArray = new Uint8Array(e.target.result);
      const workbook = XLSX.read(dataArray, { type: "array" });

      const sheetName = workbook.SheetNames.includes("Subcontratos")
        ? "Subcontratos"
        : workbook.SheetNames.includes("DashboardData")
        ? "DashboardData"
        : workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];

      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      });

      const looksLikeAdministrador =
        matrix.length >= 3 &&
        (matrix[1] || []).some(
          (cell) => normalizeText(cell) === "Descripción"
        );

      let parsedDashboardData = [];

      if (looksLikeAdministrador) {
        const erpRows = parseSubcontratosAdministrador(matrix);
        if (!erpRows.length) {
          alert(
            "No se encontraron registros válidos en el formato de Subcontratos_Administrador. Revisa que el layout no haya cambiado."
          );
          return;
        }

        parsedDashboardData = erpRows.map((row) => {
          const avance = normalizeNumber(row.avance_pct);
          const contratadoConIgv = normalizeNumber(row.monto_subcontrato);
          const estado =
            avance >= 99.9
              ? "Cierre"
              : avance > 0
              ? "En Proceso"
              : "En Elaboración";

          return {
            subcontratista: row.proveedor || "",
            especialidad: row.especialidad || "",
            n_contrato: null,
            orden_servicio: row.orden_servicio || "",
            contratado: contratadoConIgv,
            costo_directo: normalizeNumber(row.costo_directo),
            monto_costo_directo_os: contratadoConIgv
              ? contratadoConIgv / 1.18
              : 0,
            avance_pct: avance,
            n_valorizacion: null,
            estado,
            comentarios: "",
            fecha: null,
            adelanto:
              row.adelanto !== null ? normalizeNumber(row.adelanto) : 0,
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
            subcontrato:
              row.subcontrato_nombre || row.subcontrato_desc || "",
            valorizaciones: row.valorizaciones || [],
            retenido: row.retenido_total || row.retenido_os || 0,
          };
        });
      } else {
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        parsedDashboardData = rows
          .map((row) => {
            const contratadoConIgv = normalizeNumber(row["Contratado (S/.)"]);
            return {
              subcontratista: normalizeText(row["Subcontratista"]),
              especialidad: normalizeText(row["Especialidad"]),
              n_contrato: row["N° Subcontrato"] || row["Nº Subcontrato"] || null,
              orden_servicio:
                normalizeText(
                  row["N° O.C. / O.S."] ||
                    row["O.S. / Val"] ||
                    row["Orden Servicio"]
                ) || "",
              contratado: contratadoConIgv,
              costo_directo: normalizeNumber(row["Costo Directo (S/.)"]),
              monto_costo_directo_os: contratadoConIgv
                ? contratadoConIgv / 1.18
                : 0,
              avance_pct: normalizeNumber(row["% Avance"]),
              n_valorizacion: row["Valorización"] || row["Val"] || null,
              estado: row["Estado"] || "Sin Estado",
              comentarios: row["Comentarios"] || "",
              fecha: row["Fecha"] ? String(row["Fecha"]) : null,
              subcontrato: normalizeText(
                row["Subcontrato"] ||
                  row["Descripción Subcontrato"] ||
                  row["Descripcion Subcontrato"] ||
                  ""
              ),
              valorizaciones: [],
              adelanto_calculado: normalizeNumber(
                row["Adelanto Calculado"] || row["Adelanto"]
              ),
              adelanto_amortizado: normalizeNumber(
                row["Adelanto Amortizado"] || 0
              ),
              retenido: normalizeNumber(row["Retenido"] || 0),
            };
          })
          .filter((rItem) => rItem.subcontratista && rItem.orden_servicio);
      }

      if (!parsedDashboardData.length) {
        alert(
          "No se encontraron registros válidos en la hoja seleccionada. Revisa los nombres de las columnas."
        );
        return;
      }

      // Merge para conservar cerrado + notas internas
      setData((prev) => {
        const metaMap = new Map();
        prev.forEach((item) => {
          const key = buildRecordKey(item);
          metaMap.set(key, {
            cerrado: !!item.cerrado,
            observacion_manual: item.observacion_manual || "",
          });
        });

        const merged = parsedDashboardData.map((item, index) => {
          const base = enrichRecord(item, index + 1);
          const meta = metaMap.get(buildRecordKey(base));
          return {
            ...base,
            cerrado: meta?.cerrado ?? base.cerrado ?? false,
            observacion_manual:
              meta?.observacion_manual ?? base.observacion_manual ?? "",
          };
        });

        return merged.map((item, idx) => ({ ...item, id: idx + 1 }));
      });
    };

    reader.readAsArrayBuffer(file);
  };

  // ---------------------------------------------------------------------------
  // DERIVED DATA
  // ---------------------------------------------------------------------------
  const contractors = useMemo(
    () => [...new Set(data.map((d) => d.subcontratista))],
    [data]
  );

  const statuses = useMemo(
    () => [...new Set(data.map((d) => d.estado || "Sin Estado"))],
    [data]
  );

  const filteredData = useMemo(
    () =>
      data.filter((item) => {
        const matchesSearch =
          item.subcontratista
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          item.orden_servicio
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesContractor =
          selectedContractor === "all" ||
          item.subcontratista === selectedContractor;
        const status = item.estado || "Sin Estado";
        const matchesStatus =
          selectedStatus === "all" || status === selectedStatus;
        return matchesSearch && matchesContractor && matchesStatus;
      }),
    [data, searchTerm, selectedContractor, selectedStatus]
  );

  // items para simulador (acumulados por OS)
  const simulationItems = useMemo(() => {
    const items = [];
    filteredData.forEach((contrato) => {
      if (contrato.valorizaciones && contrato.valorizaciones.length > 0) {
        const totalCd = contrato.valorizaciones.reduce(
          (acc, v) =>
            acc +
            (v.costo_directo || v.monto_valorizacion || 0),
          0
        );
        const maxPct = contrato.valorizaciones.reduce(
          (acc, v) => Math.max(acc, v.avance_pct || 0),
          0
        );
        const nVals = contrato.valorizaciones.length;
        const simId = `${contrato.id}::acum`;

        items.push({
          simId,
          contratoId: contrato.id,
          subcontratista: contrato.subcontratista,
          orden_servicio: contrato.orden_servicio,
          subcontrato: contrato.subcontrato,
          n_valorizacion: nVals,
          label_valorizacion: `ACUM-VAL ${String(nVals).padStart(2, "0")}`,
          avance_pct: maxPct,
          contratado: contrato.contratado || 0,
          costo_directo: totalCd,
        });
      } else {
        const simId = `${contrato.id}::os`;
        items.push({
          simId,
          contratoId: contrato.id,
          subcontratista: contrato.subcontratista,
          orden_servicio: contrato.orden_servicio,
          subcontrato: contrato.subcontrato,
          n_valorizacion: null,
          label_valorizacion: null,
          avance_pct: contrato.avance_pct ?? 0,
          contratado: contrato.contratado || 0,
          costo_directo: contrato.costo_directo || 0,
        });
      }
    });
    return items;
  }, [filteredData]);

  // si el item simulado desaparece por filtros, resetear
  useEffect(() => {
    if (!simulatedId) return;
    const exists = simulationItems.some((x) => x.simId === simulatedId);
    if (!exists) {
      setSimulatedId("");
      setTargetPct(null);
    }
  }, [simulationItems, simulatedId]);

  // inicializar meta del simulador con avance actual
  useEffect(() => {
    if (!simulatedId) return;
    const item = simulationItems.find((x) => x.simId === simulatedId);
    if (item) {
      setTargetPct(item.avance_pct || 0);
    }
  }, [simulatedId, simulationItems]);

  const simulationResult = useMemo(() => {
    if (!simulatedId) return null;
    const item = simulationItems.find((x) => x.simId === simulatedId);
    if (!item) return null;

    const currentPct = item.avance_pct || 0;
    const metaPct =
      targetPct !== null && targetPct !== undefined ? targetPct : currentPct;
    const newTotalPct = Math.min(100, Math.max(0, metaPct));

    const currentCost = item.costo_directo || 0;
    const newCost = (item.contratado || 0) * (newTotalPct / 100);
    const deltaCost = newCost - currentCost;

    return {
      item,
      currentPct,
      newTotalPct,
      currentCost,
      newCost,
      deltaCost,
    };
  }, [simulatedId, targetPct, simulationItems]);

  // KPIs
  const kpis = useMemo(() => {
    const totalContratado = filteredData.reduce(
      (acc, curr) => acc + (curr.contratado || 0),
      0
    );
    const totalCosto = filteredData.reduce(
      (acc, curr) => acc + (curr.costo_directo || 0),
      0
    );
    const avgAvance =
      totalContratado > 0 ? (totalCosto / totalContratado) * 100 : 0;
    return { totalContratado, totalCosto, avgAvance };
  }, [filteredData]);

  // resumen por subcontratista
  const subcontractorSummary = useMemo(() => {
    const map = {};
    filteredData.forEach((item) => {
      const prov = item.subcontratista || "Sin Proveedor";
      if (!map[prov]) {
        map[prov] = {
          name: prov.split(" ")[0],
          full_name: prov,
          contracts: 0,
          monto_contratado: 0,
          monto_costo_directo: 0,
        };
      }
      map[prov].contracts += 1;
      map[prov].monto_contratado += item.contratado || 0;
      map[prov].monto_costo_directo += item.costo_directo || 0;
    });
    return Object.values(map);
  }, [filteredData]);

  const [subSummarySortState, setSubSummarySortState] = useState(
    subSummarySort
  );

  useEffect(() => {
    setSubSummarySortState(subSummarySort);
  }, [subSummarySort]);

  const sortedSubcontractorSummary = useMemo(() => {
    const arr = [...subcontractorSummary];
    const { field, direction } = subSummarySortState;
    const dir = direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (a[field] < b[field]) return -1 * dir;
      if (a[field] > b[field]) return 1 * dir;
      return 0;
    });
    return arr;
  }, [subcontractorSummary, subSummarySortState]);

  const totalResumenContratado = useMemo(
    () =>
      subcontractorSummary.reduce(
        (acc, curr) => acc + (curr.monto_contratado || 0),
        0
      ),
    [subcontractorSummary]
  );

  const statusSummary = useMemo(() => {
    const map = {};
    filteredData.forEach((item) => {
      const key = item.estado || "Sin Estado";
      if (!map[key]) {
        map[key] = { name: key, monto: 0 };
      }
      map[key].monto += item.contratado || 0;
    });
    return Object.values(map);
  }, [filteredData]);

  const STATUS_COLORS = ["#22c55e", "#f97316", "#0ea5e9", "#a855f7", "#64748b"];

  // subcontratos críticos (más registros)
  const criticalContracts = useMemo(
    () =>
      [...filteredData]
        .filter((item) => !item.cerrado)
        .sort((a, b) => (a.avance_pct || 0) - (b.avance_pct || 0))
        .slice(0, 10),
    [filteredData]
  );

  // Fondo de garantía
  const fgMetrics = useMemo(() => {
    const totalCdAcum = filteredData.reduce(
      (acc, curr) => acc + (curr.costo_directo || 0),
      0
    );
    const totalRetenido = filteredData.reduce(
      (acc, curr) => acc + (curr.retenido || 0),
      0
    );
    const totalAdelCalc = filteredData.reduce(
      (acc, curr) =>
        acc +
        (curr.adelanto_calculado != null
          ? curr.adelanto_calculado
          : curr.adelanto || 0),
      0
    );
    const totalAdelAmort = filteredData.reduce(
      (acc, curr) => acc + (curr.adelanto_amortizado || 0),
      0
    );

    const fgTeorico = totalCdAcum * 1.18 * 0.05;
    const fgS10 = totalRetenido;
    const fgAdelTotal = totalAdelCalc * 0.05;
    const fgAdelAmortizado = totalAdelAmort * 0.05;

    return {
      fgTeorico,
      fgS10,
      fgAdelTotal,
      fgAdelAmortizado,
    };
  }, [filteredData]);

  // Ordenamiento detalle
  const sortedDetailData = useMemo(() => {
    if (!detailSort.field) return filteredData;
    const arr = [...filteredData];
    const { field, direction } = detailSort;
    const dir = direction === "asc" ? 1 : -1;

    const getValue = (item) => {
      switch (field) {
        case "orden_servicio":
          return item.orden_servicio || "";
        case "contratado":
          return item.contratado || 0;
        case "cd_contrat":
          return (
            item.monto_costo_directo_os ||
            (item.contratado ? item.contratado / 1.18 : 0)
          );
        case "cd_acum":
          return item.costo_directo || 0;
        case "saldo_cd": {
          const cdContr =
            item.monto_costo_directo_os ||
            (item.contratado ? item.contratado / 1.18 : 0);
          return cdContr - (item.costo_directo || 0);
        }
        case "adelanto":
          return item.adelanto || 0;
        case "adel_amort":
          return item.adelanto_amortizado || 0;
        default:
          return 0;
      }
    };

    arr.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === "string" || typeof vb === "string") {
        return va.toString().localeCompare(vb.toString()) * dir;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return arr;
  }, [filteredData, detailSort]);

  // scroll tipo Procore: calcular máximos y sincronizar con slider
  useEffect(() => {
    const bottom = bottomScrollRef.current;
    if (!bottom) return;

    const updateMetrics = () => {
      const max = Math.max(0, bottom.scrollWidth - bottom.clientWidth);
      setScrollMax(max);
      setScrollValue(bottom.scrollLeft);
    };

    updateMetrics();

    const handleScroll = () => {
      setScrollValue(bottom.scrollLeft);
    };

    bottom.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", updateMetrics);

    return () => {
      bottom.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [activeTab, data.length]);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------
  const handleToggleCerrado = (id) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, cerrado: !item.cerrado } : item
      )
    );
  };

  const handleChangeObservacion = (id, value) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, observacion_manual: value } : item
      )
    );
  };

  const handleClearNotes = () => {
    if (
      !window.confirm(
        "¿Eliminar todas las notas internas? Solo se borran los comentarios manuales, no los datos del ERP."
      )
    ) {
      return;
    }
    setData((prev) =>
      prev.map((item) => ({ ...item, observacion_manual: "" }))
    );
  };

  const handleSubSummarySort = (field) => {
    setSubSummarySort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { field, direction: "desc" };
    });
  };

  const subSummarySortIndicator = (field) => {
    if (subSummarySort.field !== field) return "↕";
    return subSummarySort.direction === "asc" ? "↑" : "↓";
  };

  const handleDetailSort = (field) => {
    setDetailSort((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { field, direction: "desc" };
    });
  };

  const detailSortIndicator = (field) => {
    if (detailSort.field !== field) return "";
    return detailSort.direction === "asc" ? "↑" : "↓";
  };

  const handleScrollSliderChange = (value) => {
    const newVal = Number(value);
    setScrollValue(newVal);
    if (bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = newVal;
    }
  };

  const nudgeScroll = (delta) => {
    if (!bottomScrollRef.current) return;
    const bottom = bottomScrollRef.current;
    const next = Math.min(
      scrollMax,
      Math.max(0, bottom.scrollLeft + delta)
    );
    bottom.scrollLeft = next;
    setScrollValue(next);
  };

  const STATUS_COLORS_MAP = STATUS_COLORS;

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 pb-10">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calculator className="text-sky-400" />
                <span>Control de Subcontratos &amp; Valorizaciones</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Dashboard ejecutivo para seguimiento de avance físico y
                financiero de subcontratos S10.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-xs bg-slate-900/70 py-2 px-4 rounded-lg border border-slate-700">
                <span className="text-slate-400">Fuente:</span>
                <span className="font-semibold text-emerald-300">
                  Subcontratos_Administrador.xlsx / DashboardData
                </span>
              </div>

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

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 border-t border-slate-800 flex justify-between items-center">
          <div className="flex gap-4">
            <TabButton
              active={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </TabButton>
            <TabButton
              active={activeTab === "detalle"}
              onClick={() => setActiveTab("detalle")}
            >
              Detalle de subcontratos
            </TabButton>
          </div>
          <button
            type="button"
            onClick={handleClearNotes}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-300 hover:text-rose-200 border border-rose-500/60 hover:border-rose-400 px-2.5 py-1.5 rounded-lg bg-rose-900/40"
          >
            <Trash2 size={14} />
            Limpiar notas internas
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
        {/* FILTROS */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-sm flex items-center gap-2 text-slate-100">
              <Filter size={18} /> Filtros de análisis
            </h2>
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className="text-slate-400 hover:text-slate-200"
            >
              {filtersOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Buscar
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-500"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Proveedor, O.S..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-700 rounded-lg bg-slate-950/60 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Proveedor
                </label>
                <select
                  className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-950/60 text-sm text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                  value={selectedContractor}
                  onChange={(e) => setSelectedContractor(e.target.value)}
                >
                  <option value="all">Todos los proveedores</option>
                  {contractors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-950/60 text-sm text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                >
                  <option value="all">Todos los estados</option>
                  {statuses.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card
                title="Monto total contratado"
                value={formatCurrency(kpis.totalContratado)}
                icon={Briefcase}
                color="blue"
                subtext={`${filteredData.length} OS filtradas`}
              />
              <Card
                title="Costo directo acumulado"
                value={formatCurrency(kpis.totalCosto)}
                icon={DollarSign}
                color="green"
                subtext="Valorizado a la fecha"
              />
              <Card
                title="Avance físico global"
                value={formatPct(kpis.avgAvance)}
                icon={TrendingUp}
                color="amber"
                subtext="Ponderado por monto"
              />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* IZQUIERDA: Simulador + FG */}
              <div className="space-y-6 lg:col-span-1">
                {/* SIMULADOR */}
                <div className="bg-slate-900/80 text-white p-5 rounded-2xl shadow-md border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Calculator size={100} />
                  </div>

                  <div className="flex justify-between items-center relative z-10 mb-2">
                    <h2 className="font-semibold text-sm flex items-center gap-2 text-emerald-300">
                      <TrendingUp size={18} /> Simulador de avance
                    </h2>
                    <button
                      type="button"
                      onClick={() => setSimulatorOpen((prev) => !prev)}
                      className="text-slate-400 hover:text-slate-100"
                    >
                      {simulatorOpen ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                  </div>

                  <p className="text-slate-400 text-xs mb-4 relative z-10">
                    Acumula las valorizaciones por O.S. y proyecta el impacto
                    en el costo directo según una meta de avance.
                  </p>

                  {simulatorOpen && (
                    <div className="space-y-4 relative z-10">
                      <div>
                        <label className="block text-[11px] uppercase font-semibold text-slate-400 mb-1">
                          Seleccionar (Proveedor / OS / acumulado)
                        </label>
                        <select
                          className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm text-white focus:border-emerald-500 outline-none"
                          value={simulatedId}
                          onChange={(e) => setSimulatedId(e.target.value)}
                        >
                          <option value="">
                            -- Selecciona para proyectar --
                          </option>
                          {simulationItems.map((item) => (
                            <option key={item.simId} value={item.simId}>
                              {item.subcontratista.substring(0, 15)}
                              ... | {item.orden_servicio}{" "}
                              {item.label_valorizacion
                                ? `- ${item.label_valorizacion}`
                                : "- Contrato"}{" "}
                              ({formatPct(item.avance_pct)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {simulationResult && (
                        <div className="space-y-4">
                          <div className="text-xs text-slate-300">
                            <div className="font-semibold">
                              {simulationResult.item.subcontratista}
                            </div>
                            <div className="text-slate-400">
                              {simulationResult.item.orden_servicio} ·{" "}
                              {simulationResult.item.subcontrato ||
                                "Sin descripción"}
                            </div>
                            <div className="mt-1 text-emerald-300">
                              {simulationResult.item.label_valorizacion ? (
                                <>
                                  {simulationResult.item.label_valorizacion} ·
                                  % acum:{" "}
                                  {formatPct(
                                    simulationResult.currentPct
                                  )}
                                </>
                              ) : (
                                <>Contrato sin valorizaciones registradas</>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Meta de avance:</span>
                              <span className="font-bold text-emerald-400">
                                {formatPct(
                                  simulationResult.newTotalPct ?? 0
                                )}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="0.1"
                              value={
                                targetPct ??
                                simulationResult.newTotalPct ??
                                simulationResult.currentPct
                              }
                              onChange={(e) =>
                                setTargetPct(Number(e.target.value))
                              }
                              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                              <span>
                                Actual:{" "}
                                {formatPct(simulationResult.currentPct)}
                              </span>
                              <span>
                                Meta:{" "}
                                {formatPct(simulationResult.newTotalPct)}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-700 space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">
                                CD acumulado actual:
                              </span>
                              <span>
                                {formatCurrency(
                                  simulationResult.currentCost
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-300 font-semibold">
                                CD proyectado:
                              </span>
                              <span className="text-emerald-300 font-bold">
                                {formatCurrency(
                                  simulationResult.newCost
                                )}
                              </span>
                            </div>
                            <div className="border-t border-slate-700 pt-2 flex justify-between items-center">
                              <span className="text-amber-300">
                                Delta (a pagar):
                              </span>
                              <span className="text-amber-300 font-mono">
                                {simulationResult.deltaCost >= 0 ? "+" : ""}
                                {formatCurrency(
                                  simulationResult.deltaCost
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* FONDO DE GARANTÍA */}
                <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4">
                  <h4 className="text-xs font-semibold text-slate-200 mb-2">
                    Fondo de garantía – resumen
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-center text-[11px]">
                    <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 flex flex-col justify-between">
                      <div className="font-semibold tracking-wide text-slate-300">
                        FG TEÓRICO
                      </div>
                      <div className="mt-2 text-lg font-extrabold text-sky-300">
                        {formatCurrency(fgMetrics.fgTeorico)}
                      </div>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 flex flex-col justify-between">
                      <div className="font-semibold tracking-wide text-slate-300">
                        FG S10
                      </div>
                      <div className="mt-2 text-lg font-extrabold text-emerald-300">
                        {formatCurrency(fgMetrics.fgS10)}
                      </div>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 flex flex-col justify-between">
                      <div className="font-semibold tracking-wide text-slate-300">
                        FG ADELANTO TOTAL
                      </div>
                      <div className="mt-2 text-lg font-extrabold text-amber-300">
                        {formatCurrency(fgMetrics.fgAdelTotal)}
                      </div>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-3 flex flex-col justify-between">
                      <div className="font-semibold tracking-wide text-slate-300">
                        FG ADELANTO AMORTIZADO
                      </div>
                      <div className="mt-2 text-lg font-extrabold text-fuchsia-300">
                        {formatCurrency(fgMetrics.fgAdelAmortizado)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DERECHA: críticos + estados + resumen subcontratos */}
              <div className="lg:col-span-2 space-y-6">
                {/* críticos */}
                <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4">
                  <h4 className="text-xs font-semibold text-slate-200 mb-3">
                    Subcontratos críticos (menor avance y abiertos)
                  </h4>
                  <div className="space-y-2 text-[11px] max-h-[230px] overflow-y-auto pr-1">
                    {criticalContracts.length === 0 && (
                      <p className="text-slate-500">
                        No hay subcontratos abiertos con avance crítico.
                      </p>
                    )}
                    {criticalContracts.map((item) => {
                      const cdContrat =
                        item.monto_costo_directo_os ||
                        (item.contratado ? item.contratado / 1.18 : 0);
                      const saldoCd = cdContrat - (item.costo_directo || 0);

                      return (
                        <div
                          key={item.id}
                          className={`rounded-lg border border-slate-700 bg-slate-950/60 p-2`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-100 truncate max-w-[200px]">
                              {item.subcontratista}
                            </span>
                            <span className="font-mono text-rose-300">
                              {formatPct(item.avance_pct)}
                            </span>
                          </div>
                          <div className="text-slate-400 truncate">
                            {item.orden_servicio} ·{" "}
                            {item.subcontrato || "Sin descripción"}
                          </div>
                          <div className="flex justify-between items-center mt-1 text-slate-400">
                            <span>Saldo CD</span>
                            <span className="font-mono text-amber-300">
                              {formatCurrency(saldoCd)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* estados + Cantidad de Subcontratos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* mix estados */}
                  <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex flex-col">
                    <h4 className="text-xs font-semibold text-slate-200 mb-3">
                      Mix de subcontratos por estado
                    </h4>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            dataKey="monto"
                            data={statusSummary}
                            cx="50%"
                            cy="50%"
                            outerRadius={55}
                            innerRadius={28}
                            paddingAngle={2}
                          >
                            {statusSummary.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  STATUS_COLORS_MAP[
                                    index % STATUS_COLORS_MAP.length
                                  ]
                                }
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "#020617",
                              border: "1px solid #1e293b",
                              borderRadius: "8px",
                              color: "#e5e7eb",
                            }}
                            formatter={(value, name) => [
                              formatCurrency(value),
                              name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1">
                      {statusSummary.map((s, idx) => (
                        <div
                          key={s.name}
                          className="flex justify-between items-center text-[11px] text-slate-300"
                        >
                          <span className="flex items-center gap-1">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  STATUS_COLORS_MAP[
                                    idx % STATUS_COLORS_MAP.length
                                  ],
                              }}
                            />
                            {s.name}
                          </span>
                          <span className="font-mono">
                            {formatCurrency(s.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cantidad de subcontratos */}
                  <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex flex-col">
                    <h4 className="text-xs font-semibold text-slate-200 mb-2">
                      Cantidad de Subcontratos
                    </h4>
                    <div className="mt-1 max-h-[190px] overflow-y-auto pr-1">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-800">
                            <th className="py-1 pr-2 text-left">
                              Subcontratista
                            </th>
                            <th className="py-1 px-1 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleSubSummarySort("contracts")}
                                className="inline-flex items-center gap-1 hover:text-slate-200"
                              >
                                # Subc.
                                <span>
                                  {subSummarySortIndicator("contracts")}
                                </span>
                              </button>
                            </th>
                            <th className="py-1 px-1 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSubSummarySort("monto_contratado")
                                }
                                className="inline-flex items-center gap-1 hover:text-slate-200"
                              >
                                Monto contrat.
                                <span>
                                  {subSummarySortIndicator("monto_contratado")}
                                </span>
                              </button>
                            </th>
                            <th className="py-1 pl-1 text-left whitespace-nowrap">
                              Peso
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSubcontractorSummary.map((s) => {
                            const share =
                              totalResumenContratado > 0
                                ? (s.monto_contratado /
                                    totalResumenContratado) *
                                  100
                                : 0;
                            return (
                              <tr
                                key={s.full_name}
                                className="border-b border-slate-800/60 last:border-none"
                              >
                                <td className="py-1 pr-2 text-slate-100">
                                  <div className="truncate max-w-[120px]">
                                    {s.full_name}
                                  </div>
                                </td>
                                <td className="py-1 px-1 text-right text-slate-200">
                                  {s.contracts}
                                </td>
                                <td className="py-1 px-1 text-right text-slate-200 whitespace-nowrap">
                                  {formatCurrency(s.monto_contratado)}
                                </td>
                                <td className="py-1 pl-1">
                                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-400"
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          share
                                        ).toFixed(1)}%`,
                                      }}
                                    ></div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {sortedSubcontractorSummary.length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="py-2 text-center text-slate-500"
                              >
                                Sin registros en el filtro actual.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* DETALLE */}
        {activeTab === "detalle" && (
          <section className="bg-slate-900/80 rounded-2xl shadow-md border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                  <FileText size={18} className="text-sky-400" />
                  Detalle de subcontratos y valorizaciones
                </h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-medium bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                  {filteredData.length} órdenes de servicio
                </span>

                {/* Scroll tipo Procore */}
                {scrollMax > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="hidden sm:inline">Campos</span>
                    <button
                      type="button"
                      className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700"
                      onClick={() => nudgeScroll(-120)}
                    >
                      ◀
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={scrollMax}
                      step={20}
                      value={scrollValue}
                      onChange={(e) =>
                        handleScrollSliderChange(e.target.value)
                      }
                      className="h-1 w-28 cursor-pointer accent-sky-500"
                    />
                    <button
                      type="button"
                      className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700"
                      onClick={() => nudgeScroll(120)}
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className="overflow-x-hidden overflow-y-auto max-h-[520px]"
              ref={bottomScrollRef}
            >
              <table className="w-full min-w-[1400px] text-[13px] text-left">
                <thead className="bg-slate-950/90 backdrop-blur-sm text-slate-300 font-semibold border-b border-slate-800 sticky top-0 z-20">
                  <tr>
                    <th className="px-3 py-2">Proveedor / Especialidad</th>
                    <th className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("orden_servicio")}
                        className="inline-flex items-center gap-1"
                      >
                        O.S. / Subcontrato
                        <span className="text-[10px]">
                          {detailSortIndicator("orden_servicio")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("contratado")}
                        className="inline-flex items-center gap-1"
                      >
                        Contratado IGV
                        <span className="text-[10px]">
                          {detailSortIndicator("contratado")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("cd_contrat")}
                        className="inline-flex items-center gap-1"
                      >
                        CD contr.
                        <span className="text-[10px]">
                          {detailSortIndicator("cd_contrat")}
                        </span>
                      </button>
                    </th>
                    <th className="px-1 py-2 text-center whitespace-nowrap">
                      % Av.
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("cd_acum")}
                        className="inline-flex items-center gap-1"
                      >
                        CD acum.
                        <span className="text-[10px]">
                          {detailSortIndicator("cd_acum")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("saldo_cd")}
                        className="inline-flex items-center gap-1"
                      >
                        Saldo CD
                        <span className="text-[10px]">
                          {detailSortIndicator("saldo_cd")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("adelanto")}
                        className="inline-flex items-center gap-1"
                      >
                        Adelanto
                        <span className="text-[10px]">
                          {detailSortIndicator("adelanto")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDetailSort("adel_amort")}
                        className="inline-flex items-center gap-1"
                      >
                        Amortizado
                        <span className="text-[10px]">
                          {detailSortIndicator("adel_amort")}
                        </span>
                      </button>
                    </th>
                    <th className="px-2 py-2 text-center whitespace-nowrap">
                      Cerrado
                    </th>
                    <th className="px-2 py-2 text-center whitespace-nowrap">
                      Estado
                    </th>
                    <th className="px-3 py-2 whitespace-nowrap">Notas internas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedDetailData.map((item) => {
                    const cdContrat =
                      item.monto_costo_directo_os ||
                      (item.contratado ? item.contratado / 1.18 : 0);
                    const cdAcum = item.costo_directo || 0;
                    const saldoCd = cdContrat - cdAcum;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors group align-top ${
                          item.cerrado
                            ? "bg-emerald-950/40 hover:bg-emerald-950/60"
                            : "hover:bg-slate-950/60"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-100 text-[13px]">
                            {item.subcontratista}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {item.especialidad}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-[11px] bg-slate-900 w-fit px-2 py-0.5 rounded-full border border-slate-700 text-slate-200 mb-1 whitespace-nowrap">
                            {item.orden_servicio}
                          </div>
                          {item.subcontrato && (
                            <div className="text-[11px] text-slate-300 max-w-xs">
                              {item.subcontrato}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-slate-100 whitespace-nowrap">
                          {formatCurrency(item.contratado)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-slate-100 whitespace-nowrap">
                          {formatCurrency(cdContrat)}
                        </td>
                        <td className="px-1 py-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-10 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  item.avance_pct >= 90
                                    ? "bg-emerald-400"
                                    : item.avance_pct >= 50
                                    ? "bg-sky-400"
                                    : "bg-amber-400"
                                }`}
                                style={{ width: `${item.avance_pct}%` }}
                              ></div>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-100">
                              {item.avance_pct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-slate-100 whitespace-nowrap">
                          {formatCurrency(cdAcum)}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-amber-300 whitespace-nowrap">
                          {formatCurrency(saldoCd)}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-200 whitespace-nowrap">
                          {formatCurrency(item.adelanto || 0)}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-200 whitespace-nowrap">
                          {formatCurrency(item.adelanto_amortizado || 0)}
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-emerald-500 rounded border-slate-500 focus:ring-emerald-500"
                            checked={!!item.cerrado}
                            onChange={() => handleToggleCerrado(item.id)}
                          />
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          <div className="flex justify-center">
                            <Badge type={item.estado}>{item.estado}</Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          <textarea
                            className="w-full text-[11px] border border-slate-700 rounded-md p-1.5 resize-y min-h-[40px] bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            placeholder="Notas internas (no se pierden al importar otro Excel)..."
                            value={item.observacion_manual || ""}
                            onChange={(e) =>
                              handleChangeObservacion(item.id, e.target.value)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sortedDetailData.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                <p>No se encontraron datos con los filtros actuales.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
