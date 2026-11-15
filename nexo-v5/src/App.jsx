
import React, { useEffect, useState } from "react";
import Auth from "./Auth.jsx";
import { supabase } from "./supabase";
import { QRCodeCanvas } from "qrcode.react";
import {
  Activity, Bell, Check, CheckCheck, ChevronDown, CircleHelp,
  Clock3, CreditCard, Download, LayoutDashboard, LogOut, Menu,
  MoreHorizontal, Plus, QrCode, Search, Settings, ShieldCheck,
  Table2, Users, Utensils, Wallet, X, ArrowUpRight, CircleCheck,
  Timer, Smartphone, ClipboardList, TrendingUp, Filter, Copy,
  RefreshCw, ExternalLink
} from "lucide-react";

const STORAGE_KEY = "nexo-v5-state";

const defaultState = {
  restaurant: {
    name: "NEXO Demo",
    subtitle: "Restaurante & Café",
    currency: "USD",
    timezone: "America/Caracas"
  },
  tables: [],
  requests: [],
  staff: [
    { id: 1, name: "Camila", role: "Camarera", active: true },
    { id: 2, name: "Andrés", role: "Camarero", active: true },
    { id: 3, name: "Valentina", role: "Administradora", active: true }
  ],
  settings: {
    sound: true,
    autoAssign: false,
    serviceHours: "09:00 – 22:00"
  }
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState;

    const parsed = JSON.parse(saved);

    return {
      ...defaultState,
      ...parsed,
      restaurant: {
        ...defaultState.restaurant,
        ...parsed.restaurant,
        name: "NEXO Demo"
      },
      tables: [],
      requests: []
    };
  } catch {
    return defaultState;
  }
}

const requestTypes = {
  call_waiter: "atencion",
  request_bill: "cuenta",
  place_order: "pedido",
  atencion: "atencion",
  cuenta: "cuenta",
  pedido: "pedido"
};

const databaseRequestTypes = {
  atencion: "call_waiter",
  cuenta: "request_bill",
  pedido: "place_order"
};

const databaseStatuses = {
  pending: "pendiente",
  in_progress: "en proceso",
  completed: "atendida",
  cancelled: "atendida",
  pendiente: "pending",
  "en proceso": "in_progress",
  atendida: "completed"
};

const requestLabel = type => ({
  atencion: "Llamar al camarero",
  cuenta: "Solicitar cuenta",
  pedido: "Hacer un pedido"
}[type] || type);

const statusClass = status => status.replace(" ", "-");

const timeAgo = timestamp => {
  const mins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (mins < 1) return "Ahora";
  if (mins === 1) return "Hace 1 min";
  return `Hace ${mins} min`;
};

const fmtTime = timestamp =>
  new Date(timestamp).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });

function mapTable(row) {
  return {
    id: row.id,
    tableNumber: row.table_number,
    number: Number(row.table_number),
    seats: row.seats || 4,
    zone: row.zone || "Salón",
    status:
      row.status === "occupied"
        ? "ocupada"
        : row.status === "disabled"
          ? "deshabilitada"
          : "libre",
    qrToken: row.qr_token
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    tableId: row.table_id,
    table: row.table_number
      ? Number(row.table_number)
      : Number(row.table?.table_number || 0),
    type: requestTypes[row.request_type] || row.request_type,
    note: row.notes || "",
    status: ({
      pending: "pendiente",
      in_progress: "en proceso",
      completed: "atendida",
      cancelled: "atendida"
    })[row.status] || row.status,
    createdAt: new Date(row.created_at).getTime(),
    assigned: "Equipo"
  };
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const customerMode =
    params.get("vista") === "cliente" ||
    params.has("mesa") ||
    params.has("qr");

  const qrToken = params.get("qr");
  const tableParam = params.get("mesa");

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [restaurantError, setRestaurantError] = useState("");

  const [state, setState] = useState(loadState);
  const [page, setPage] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [customerSent, setCustomerSent] = useState(false);
  const [customerType, setCustomerType] = useState("atencion");
  const [customerNote, setCustomerNote] = useState("");
  const [customerTable, setCustomerTable] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");

  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "Camarero"
  });

  const notify = message => setToast(message);

  // AUTENTICACIÓN
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error(error);

      if (mounted) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // DATOS LOCALES
  useEffect(() => {
    const localData = {
      ...state,
      tables: [],
      requests: []
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
  }, [state]);

  // CREAR O RECUPERAR RESTAURANTE
  useEffect(() => {
    if (!session?.user?.id) {
      setRestaurantId(null);
      setRestaurantError("");
      setRestaurantLoading(false);
      return;
    }

    let mounted = true;

    async function connectRestaurant() {
      setRestaurantLoading(true);
      setRestaurantError("");

      try {
        const { data, error } = await supabase.rpc(
          "create_restaurant",
          { p_name: "NEXO Demo" }
        );

        if (error) throw error;
        if (!data) throw new Error("No se recibió el ID del restaurante.");

        if (mounted) {
          setRestaurantId(data);

          setState(current => ({
            ...current,
            restaurant: {
              ...current.restaurant,
              name: "NEXO Demo"
            }
          }));
        }
      } catch (error) {
        console.error("Error conectando restaurante:", error);

        if (mounted) {
          setRestaurantError(
            error.message || "No se pudo conectar el restaurante."
          );
        }
      } finally {
        if (mounted) setRestaurantLoading(false);
      }
    }

    connectRestaurant();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  // CARGAR MESAS Y SOLICITUDES DESDE SUPABASE
  useEffect(() => {
    if (!restaurantId) return;

    let mounted = true;

    async function loadRestaurantData() {
      try {
        let { data: tables, error: tablesError } = await supabase
          .from("restaurant_tables")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("table_number", { ascending: true });

        if (tablesError) throw tablesError;

        if (!tables || tables.length === 0) {
          const initialTables = Array.from({ length: 12 }, (_, i) => ({
            restaurant_id: restaurantId,
            table_number: String(i + 1),
            seats: i < 4 ? 2 : i < 9 ? 4 : 6,
            zone: i < 6 ? "Terraza" : "Salón",
            status: "available"
          }));

          const { error: insertError } = await supabase
            .from("restaurant_tables")
            .insert(initialTables);

          if (insertError) throw insertError;

          const result = await supabase
            .from("restaurant_tables")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .order("table_number", { ascending: true });

          if (result.error) throw result.error;
          tables = result.data;
        }

        const { data: requests, error: requestsError } = await supabase
          .from("requests")
          .select(`
            id,
            restaurant_id,
            table_id,
            request_type,
            status,
            notes,
            created_at,
            restaurant_tables (
              table_number
            )
          `)
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false });

        if (requestsError) throw requestsError;

        if (mounted) {
          setState(current => ({
            ...current,
            restaurant: {
              ...current.restaurant,
              name: "NEXO Demo"
            },
            tables: (tables || []).map(mapTable),
            requests: (requests || []).map(row =>
              mapRequest({
                ...row,
                table_number:
                  row.restaurant_tables?.table_number
              })
            )
          }));
        }
      } catch (error) {
        console.error("Error cargando datos:", error);

        if (mounted) {
          setRestaurantError(
            error.message || "No se pudieron cargar las mesas y solicitudes."
          );
        }
      }
    }

    loadRestaurantData();

    const channel = supabase
      .channel(`nexo-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requests",
          filter: `restaurant_id=eq.${restaurantId}`
        },
        () => loadRestaurantData()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_tables",
          filter: `restaurant_id=eq.${restaurantId}`
        },
        () => loadRestaurantData()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // CARGAR MESA PARA LA VISTA DEL CLIENTE
  // CORRECCIÓN: se utiliza maybeSingle() en lugar de single()
  useEffect(() => {
    if (!customerMode) return;

    let mounted = true;

    async function loadCustomerTable() {
      setCustomerLoading(true);
      setCustomerError("");
      setCustomerTable(null);

      try {
        if (!qrToken) {
          throw new Error("No se encontró el código QR de la mesa.");
        }

        const { data, error } = await supabase
          .from("restaurant_tables")
          .select("*")
          .eq("qr_token", qrToken)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          throw new Error(
            "No se encontró esta mesa. Verifica el código QR o los permisos de acceso público en Supabase."
          );
        }

        if (mounted) {
          setCustomerTable(mapTable(data));
        }
      } catch (error) {
        console.error("Error cargando mesa del cliente:", error);

        if (mounted) {
          setCustomerError(
            error.message || "No se pudo cargar la mesa."
          );
        }
      } finally {
        if (mounted) setCustomerLoading(false);
      }
    }

    loadCustomerTable();

    return () => {
      mounted = false;
    };
  }, [customerMode, qrToken]);

  // TOAST
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = fn => {
    setState(current => fn(structuredClone(current)));
  };

  const activeRequests = state.requests.filter(
    r => r.status !== "atendida"
  );

  const pending = state.requests.filter(
    r => r.status === "pendiente"
  );

  const inProgress = state.requests.filter(
    r => r.status === "en proceso"
  );

  const todayCount = state.requests.length;

  const average = state.requests.length
    ? Math.round(
        state.requests.reduce(
          (sum, r) =>
            sum + Math.max(1, (Date.now() - r.createdAt) / 60000),
          0
        ) / state.requests.length
      )
    : 0;

  // CREAR SOLICITUD DESDE EL PANEL ADMINISTRATIVO
  const createRequest = async (table, type, note = "") => {
    const selectedTable = state.tables.find(
      t => t.number === Number(table)
    );

    if (!selectedTable) {
      notify("No se encontró la mesa.");
      return;
    }

    try {
      const { error } = await supabase.rpc(
        "create_customer_request",
        {
          p_qr_token: selectedTable.qrToken,
          p_request_type: databaseRequestTypes[type],
          p_notes: note || requestLabel(type)
        }
      );

      if (error) throw error;

      notify("Solicitud enviada a Supabase.");
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo crear la solicitud.");
    }
  };

  // CREAR SOLICITUD DESDE EL QR DEL CLIENTE
  const createCustomerRequest = async () => {
    if (!customerTable?.qrToken) {
      setCustomerError("No se encontró el código QR de esta mesa.");
      return;
    }

    try {
      setCustomerLoading(true);
      setCustomerError("");

      const { error } = await supabase.rpc(
        "create_customer_request",
        {
          p_qr_token: customerTable.qrToken,
          p_request_type: databaseRequestTypes[customerType],
          p_notes: customerNote || requestLabel(customerType)
        }
      );

      if (error) throw error;

      setCustomerSent(true);
    } catch (error) {
      console.error(error);
      setCustomerError(error.message || "No se pudo enviar la solicitud.");
    } finally {
      setCustomerLoading(false);
    }
  };

  // CAMBIAR ESTADO DE SOLICITUD EN SUPABASE
  const changeRequest = async (id, status) => {
    const databaseStatus = databaseStatuses[status];

    try {
      const { error } = await supabase
        .from("requests")
        .update({ status: databaseStatus })
        .eq("id", id)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      notify(
        status === "atendida"
          ? "Solicitud marcada como atendida."
          : "Solicitud actualizada."
      );
    } catch (error) {
      console.error(error);
      notify(error.message || "No se pudo actualizar la solicitud.");
    }
  };

  if (authLoading && !customerMode) {
    return <LoadingScreen text="Cargando NEXO..." />;
  }

  if (!session && !customerMode) {
    return <Auth onLogin={() => {}} />;
  }

  if (session && restaurantLoading && !customerMode) {
    return <LoadingScreen text="Conectando NEXO con Supabase..." />;
  }

  if (session && restaurantError && !customerMode) {
    return (
      <ErrorScreen
        title="Error al conectar NEXO"
        message={restaurantError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (customerMode) {
    if (customerLoading) {
      return <LoadingScreen text="Cargando mesa..." />;
    }

    if (customerError && !customerTable) {
      return (
        <ErrorScreen
          title="No se pudo abrir la mesa"
          message={customerError}
          onRetry={() => window.location.reload()}
        />
      );
    }

    return (
      <CustomerView
        table={customerTable}
        sent={customerSent}
        setSent={setCustomerSent}
        type={customerType}
        setType={setCustomerType}
        note={customerNote}
        setNote={setCustomerNote}
        onSend={createCustomerRequest}
        loading={customerLoading}
        error={customerError}
      />
    );
  }

  const nav = [
    { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
    { id: "solicitudes", label: "Solicitudes", icon: Bell, count: pending.length },
    { id: "mesas", label: "Mesas", icon: Table2 },
    { id: "equipo", label: "Equipo", icon: Users },
    { id: "reportes", label: "Reportes", icon: TrendingUp },
    { id: "configuracion", label: "Configuración", icon: Settings }
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <b>NEXO<span>.</span></b>
            <small>RESTAURANT OS</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="restaurant-switch">
          <div className="restaurant-avatar"><Utensils size={17} /></div>
          <div>
            <b>NEXO Demo</b>
            <small>Restaurante & Café</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-caption">MENÚ PRINCIPAL</div>

        <nav>
          {nav.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.count > 0 && <em>{item.count}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={17} /></div>
            <b>¿Necesitas ayuda?</b>
            <p>Consulta la guía rápida de NEXO.</p>
            <button onClick={() => notify("Centro de ayuda: próximamente")}>
              Ver ayuda <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="profile">
            <div className="profile-avatar">N</div>
            <div>
              <b>{session?.user?.email || "Administrador"}</b>
              <small>Administrador</small>
            </div>
            <button
              className="icon-button"
              title="Cerrar sesión"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) notify("No se pudo cerrar la sesión.");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="top-left">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}>
              <Menu />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span>{" "}
              <b>{nav.find(n => n.id === page)?.label || "Resumen"}</b>
            </div>
          </div>

          <div className="top-actions">
            <div className="live-indicator"><i /> Sistema conectado</div>
            <button className="icon-button" onClick={() => setPage("solicitudes")}>
              <Bell size={18} />
              {pending.length > 0 && <i className="notification-dot" />}
            </button>
            <div className="top-avatar">N</div>
          </div>
        </header>

        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              state={state}
              pending={pending}
              inProgress={inProgress}
              activeRequests={activeRequests}
              todayCount={todayCount}
              average={average}
              setPage={setPage}
              changeRequest={changeRequest}
              notify={notify}
            />
          )}

          {page === "solicitudes" && (
            <Requests
              state={state}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              changeRequest={changeRequest}
              notify={notify}
            />
          )}

          {page === "mesas" && (
            <Tables
              state={state}
              setModal={setModal}
              createRequest={createRequest}
              notify={notify}
            />
          )}

          {page === "equipo" && (
            <Team
              state={state}
              setModal={setModal}
              update={update}
              notify={notify}
            />
          )}

          {page === "reportes" && (
            <Reports state={state} average={average} />
          )}

          {page === "configuracion" && (
            <SettingsPage state={state} update={update} notify={notify} />
          )}
        </div>
      </main>

      {modal && (
        <Modal
          modal={modal}
          setModal={setModal}
          state={state}
          update={update}
          notify={notify}
          newStaff={newStaff}
          setNewStaff={setNewStaff}
        />
      )}

      {toast && (
        <div className="toast">
          <CircleCheck size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function LoadingScreen({ text }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#090d18",
      color: "#fff",
      fontSize: "15px"
    }}>
      {text}
    </div>
  );
}

function ErrorScreen({ title, message, onRetry }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#090d18",
      color: "#fff",
      padding: 24
    }}>
      <div style={{ maxWidth: 480 }}>
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onRetry}>Reintentar</button>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, desc, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, delta, icon: Icon, tone = "blue", foot }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${tone}`}><Icon size={18} /></div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {delta && <span className="positive">{delta}</span>}
        <span>{foot}</span>
      </div>
    </div>
  );
}

function Dashboard({
  state, pending, inProgress, activeRequests, todayCount,
  average, setPage, changeRequest, notify
}) {
  const recent = state.requests.slice(0, 5);
  const occupied = state.tables.filter(t => t.status !== "libre").length;

  return (
    <>
      <PageHeading
        eyebrow="CENTRO DE OPERACIONES"
        title="¡Buen día!"
        desc="Aquí tienes el estado de tu restaurante en este momento."
        action={
          <button className="button primary" onClick={() => setPage("mesas")}>
            <Plus size={16} /> Nueva solicitud
          </button>
        }
      />

      <div className="welcome-banner">
        <div className="banner-copy">
          <div className="banner-pill">NEXO INSIGHTS</div>
          <h2>Tu servicio, conectado.</h2>
          <p>Gestiona cada solicitud y mantén a tu equipo coordinado desde un solo lugar.</p>
          <button onClick={() => setPage("solicitudes")}>
            Ver solicitudes <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="banner-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="phone-art">
            <div className="phone-speaker" />
            <div className="phone-screen">
              <div className="phone-logo">N.</div>
              <div className="phone-line" />
              <div className="phone-button"><Bell size={17} /></div>
              <div className="phone-line short" />
            </div>
          </div>
          <div className="float-card"><Check size={14} /> Atención confirmada</div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Solicitudes pendientes" value={pending.length}
          delta="Requieren atención" icon={Bell} tone="orange" foot="Por gestionar" />
        <StatCard label="En proceso" value={inProgress.length}
          icon={Timer} tone="purple" foot="Atención del equipo" />
        <StatCard label="Mesas activas" value={`${occupied}/${state.tables.length}`}
          icon={Table2} tone="blue" foot="Mesas con actividad" />
        <StatCard label="Solicitudes registradas" value={todayCount}
          delta="Actividad total" icon={Activity} tone="green" foot="Desde Supabase" />
      </div>

      <div className="dashboard-grid">
        <section className="panel requests-panel">
          <div className="panel-heading">
            <div><h3>Solicitudes recientes</h3><p>Últimos avisos enviados por tus clientes</p></div>
            <button className="text-button" onClick={() => setPage("solicitudes")}>
              Ver todas <ArrowUpRight size={14} />
            </button>
          </div>
          {recent.length ? (
            <div className="request-list">
              {recent.map(r => (
                <RequestRow key={r.id} request={r} changeRequest={changeRequest} />
              ))}
            </div>
          ) : <EmptyState text="Todavía no hay solicitudes." />}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><h3>Estado de las mesas</h3><p>Vista general del salón</p></div>
            <button className="more-button" onClick={() => setPage("mesas")}>
              <MoreHorizontal />
            </button>
          </div>
          <div className="occupancy">
            <div className="occupancy-number">
              {Math.round(occupied / Math.max(1, state.tables.length) * 100)}
              <small>%</small>
            </div>
            <div><b>Ocupación / actividad</b><p>{occupied} de {state.tables.length} mesas con actividad</p></div>
          </div>
          <div className="progress-track">
            <div style={{ width: `${occupied / Math.max(1, state.tables.length) * 100}%` }} />
          </div>
          <div className="legend">
            <span><i className="dot free" /> Libre</span>
            <span><i className="dot busy" /> Activa</span>
            <span><i className="dot alert" /> Solicitud</span>
          </div>
          <div className="quick-actions">
            <button onClick={() => setPage("mesas")}><QrCode size={17} /> Ver códigos QR</button>
            <button onClick={() => setPage("equipo")}><Users size={17} /> Gestionar equipo</button>
          </div>
        </section>
      </div>

      <div className="bottom-note">
        <ShieldCheck size={16} />
        <span>Mesas y solicitudes sincronizadas con Supabase.</span>
        <button onClick={() => notify("Los datos se consultan desde Supabase.")}>Detalles</button>
      </div>
    </>
  );
}

function RequestRow({ request, changeRequest }) {
  return (
    <div className="request-row">
      <div className={`request-type-icon ${request.type}`}>
        {request.type === "cuenta" ? <CreditCard size={17} /> :
          request.type === "pedido" ? <Utensils size={17} /> : <Bell size={17} />}
      </div>
      <div className="request-main">
        <b>Mesa {String(request.table).padStart(2, "0")}<span> · {requestLabel(request.type)}</span></b>
        <small>{request.note} · {timeAgo(request.createdAt)}</small>
      </div>
      <StatusPill status={request.status} />
      <div className="request-row-actions">
        {request.status !== "atendida" && (
          <button className="tiny-action" title="Marcar atendida"
            onClick={() => changeRequest(request.id, "atendida")}>
            <Check size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const labels = {
    pendiente: "Pendiente",
    "en proceso": "En proceso",
    atendida: "Atendida"
  };

  return (
    <span className={`status-pill ${statusClass(status)}`}>
      <i /> {labels[status] || status}
    </span>
  );
}

function Requests({ state, search, setSearch, filter, setFilter, changeRequest, notify }) {
  const list = state.requests.filter(r =>
    (filter === "todas" || r.status === filter) &&
    `${r.table} ${r.note} ${requestLabel(r.type)} ${r.assigned}`
      .toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeading
        eyebrow="CENTRO DE OPERACIONES"
        title="Solicitudes"
        desc="Recibe, organiza y resuelve las solicitudes de tus mesas."
        action={
          <button className="button secondary"
            onClick={() => notify("Abre la vista cliente desde el QR de una mesa.")}>
            <Smartphone size={16} /> Vista cliente
          </button>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por mesa, tipo o responsable..." />
        </div>
        <div className="filter-wrap">
          <Filter size={16} />
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="todas">Todas las solicitudes</option>
            <option value="pendiente">Pendientes</option>
            <option value="en proceso">En proceso</option>
            <option value="atendida">Atendidas</option>
          </select>
        </div>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div><h3>Bandeja de solicitudes <span className="count-badge">{list.length}</span></h3>
            <p>Solicitudes almacenadas en Supabase.</p></div>
        </div>
        <div className="data-table">
          <div className="table-head request-table-head">
            <span>MESA / SOLICITUD</span><span>HORA</span>
            <span>RESPONSABLE</span><span>ESTADO</span><span>ACCIÓN</span>
          </div>
          {list.map(r => (
            <div className="table-line request-table-line" key={r.id}>
              <div className="table-request-cell">
                <div className={`request-type-icon ${r.type}`}>
                  {r.type === "cuenta" ? <CreditCard size={16} /> :
                    r.type === "pedido" ? <Utensils size={16} /> : <Bell size={16} />}
                </div>
                <div><b>Mesa {String(r.table).padStart(2, "0")}</b>
                  <small>{requestLabel(r.type)}{r.note ? ` · ${r.note}` : ""}</small></div>
              </div>
              <span className="muted-cell">{fmtTime(r.createdAt)}</span>
              <span className="muted-cell">{r.assigned}</span>
              <span><StatusPill status={r.status} /></span>
              <div className="action-cell">
                {r.status === "pendiente" && (
                  <button className="button small secondary"
                    onClick={() => changeRequest(r.id, "en proceso")}>Tomar</button>
                )}
                {r.status === "en proceso" && (
                  <button className="button small primary"
                    onClick={() => changeRequest(r.id, "atendida")}>Resolver</button>
                )}
                {r.status === "atendida" && <span className="done-label"><CheckCheck size={15} /> Listo</span>}
              </div>
            </div>
          ))}
          {!list.length && <EmptyState text="No encontramos solicitudes con estos filtros." />}
        </div>
      </section>
    </>
  );
}

// GESTIÓN DE MESAS Y CÓDIGOS QR REALES
function Tables({ state, setModal, createRequest, notify }) {
  const [zone, setZone] = useState("Todas");
  const [selected, setSelected] = useState(null);

  const tables = state.tables.filter(t => zone === "Todas" || t.zone === zone);
  const table = state.tables.find(t => t.id === selected);

  const qrUrl = table?.qrToken
    ? `${window.location.origin}${window.location.pathname}?qr=${encodeURIComponent(table.qrToken)}`
    : "";

  const tableRequests = state.requests.filter(
    r => r.tableId === selected && r.status !== "atendida"
  );

  const downloadQR = () => {
    if (!qrUrl) {
      notify("Esta mesa no tiene un código QR disponible.");
      return;
    }

    const canvas = document.getElementById(`qr-table-${table.number}`);

    if (!canvas) {
      notify("No se pudo generar el QR.");
      return;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `nexo-mesa-${table.number}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify("QR descargado.");
  };

  const copyQR = async () => {
    if (!qrUrl) {
      notify("Esta mesa no tiene un código QR disponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(qrUrl);
      notify("Enlace QR copiado.");
    } catch (error) {
      console.error(error);
      notify("No se pudo copiar el enlace QR.");
    }
  };

  const openCustomerView = () => {
    if (!qrUrl) {
      notify("Esta mesa no tiene un código QR disponible.");
      return;
    }

    window.open(qrUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <PageHeading
        eyebrow="DISTRIBUCIÓN DEL RESTAURANTE"
        title="Gestión de mesas"
        desc="Consulta el estado de cada mesa y accede a su experiencia QR."
        action={
          <button className="button primary" onClick={() => notify("La creación de mesas desde el panel se habilitará en el siguiente paso.")}>
            <Plus size={16} /> Agregar mesa
          </button>
        }
      />

      <div className="toolbar">
        <div className="zone-tabs">
          {["Todas", "Terraza", "Salón", "Barra"].map(z => (
            <button key={z} className={zone === z ? "selected" : ""}
              onClick={() => setZone(z)}>{z}</button>
          ))}
        </div>
        <div className="legend">
          <span><i className="dot free" /> Libre</span>
          <span><i className="dot busy" /> Activa</span>
          <span><i className="dot alert" /> Solicitud</span>
        </div>
      </div>

      <div className="tables-layout">
        <section className="tables-grid">
          {tables.map(t => (
            <button key={t.id}
              className={`table-card ${t.status === "libre" ? "libre" : "ocupada"} ${selected === t.id ? "chosen" : ""}`}
              onClick={() => setSelected(t.id)}>
              <div className="table-card-top"><span>{t.zone}</span><MoreHorizontal size={16} /></div>
              <div className="table-illustration">
                <div className="chair c1" /><div className="chair c2" />
                <div className="chair c3" /><div className="chair c4" />
                <div className="table-circle">{String(t.number).padStart(2, "0")}</div>
              </div>
              <b>Mesa {String(t.number).padStart(2, "0")}</b>
              <small>{t.seats} personas</small>
              <span className={`table-status ${t.status}`}>
                {t.status === "libre" ? "Disponible" : "En servicio"}
              </span>
            </button>
          ))}
        </section>

        <aside className="panel table-detail">
          {table ? (
            <>
              <div className="detail-head">
                <div>
                  <div className="eyebrow">DETALLE DE MESA</div>
                  <h3>Mesa {String(table.number).padStart(2, "0")}</h3>
                </div>
                <button className="icon-button" onClick={() => setSelected(null)}>
                  <X size={17} />
                </button>
              </div>

              <div className="detail-facts">
                <div><small>Zona</small><b>{table.zone}</b></div>
                <div><small>Capacidad</small><b>{table.seats} personas</b></div>
                <div><small>Estado</small><b>{table.status === "libre" ? "Disponible" : "En servicio"}</b></div>
              </div>

              <div className="qr-preview">
                {qrUrl ? (
                  <QRCodeCanvas
                    id={`qr-table-${table.number}`}
                    value={qrUrl}
                    size={200}
                    level="H"
                    includeMargin={true}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                ) : (
                  <div style={{ padding: 24 }}>
                    <QrCode size={68} />
                    <p>QR no disponible</p>
                  </div>
                )}

                <b>QR de Mesa {table.number}</b>
                <small>Escanea para solicitar atención</small>
              </div>

              <button
                className="button secondary full"
                onClick={downloadQR}
              >
                <Download size={15} /> Descargar QR PNG
              </button>

              <button
                className="button primary full"
                onClick={copyQR}
              >
                <Copy size={15} /> Copiar enlace QR
              </button>

              <button
                className="button secondary full"
                onClick={openCustomerView}
              >
                Abrir vista cliente <ExternalLink size={14} />
              </button>

              <div className="detail-requests">
                <b>Solicitudes abiertas ({tableRequests.length})</b>
                {tableRequests.length ? tableRequests.map(r => (
                  <div key={r.id} className="mini-request">
                    <span>{requestLabel(r.type)}</span>
                    <StatusPill status={r.status} />
                  </div>
                )) : <p>No hay solicitudes abiertas.</p>}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <Table2 size={30} />
              <b>Selecciona una mesa</b>
              <p>Consulta sus detalles, estado y enlace de acceso QR.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function Team({ state, setModal, update, notify }) {
  return (
    <>
      <PageHeading eyebrow="PERSONAS Y OPERACIÓN" title="Equipo de trabajo"
        desc="Administra a las personas que participan en la atención."
        action={<button className="button primary" onClick={() => setModal({ type: "staff" })}><Plus size={16} /> Agregar persona</button>} />
      <div className="stats-grid team-stats">
        <StatCard label="Personas registradas" value={state.staff.length} icon={Users} tone="blue" foot="Equipo total" />
        <StatCard label="Activas" value={state.staff.filter(s => s.active).length} icon={CircleCheck} tone="green" foot="Disponibles" />
        <StatCard label="Roles" value={new Set(state.staff.map(s => s.role)).size} icon={ShieldCheck} tone="purple" foot="Perfiles configurados" />
      </div>
      <section className="panel table-panel">
        <div className="panel-heading"><div><h3>Mi equipo</h3><p>Equipo local de demostración.</p></div></div>
        <div className="team-list">
          {state.staff.map((person, i) => (
            <div className="team-row" key={person.id}>
              <div className={`person-avatar avatar-${i % 4}`}>
                {person.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="person-info"><b>{person.name}</b><small>{person.role}</small></div>
              <span className={`person-status ${person.active ? "active" : ""}`}><i />{person.active ? "Activo" : "Inactivo"}</span>
              <button className="button small secondary" onClick={() => {
                update(s => {
                  const p = s.staff.find(x => x.id === person.id);
                  p.active = !p.active;
                  return s;
                });
                notify("Estado del equipo actualizado.");
              }}>{person.active ? "Desactivar" : "Activar"}</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Reports({ state, average }) {
  const done = state.requests.filter(r => r.status === "atendida").length;
  const total = state.requests.length;
  const byType = ["atencion", "cuenta", "pedido"].map(type => ({
    type,
    count: state.requests.filter(r => r.type === type).length
  }));
  const max = Math.max(1, ...byType.map(x => x.count));

  return (
    <>
      <PageHeading eyebrow="ANÁLISIS DEL SERVICIO" title="Reportes"
        desc="Indicadores de la actividad registrada en Supabase."
        action={<button className="button secondary" onClick={() => {
          const csv = [
            "id,mesa,tipo,estado,hora",
            ...state.requests.map(r => `${r.id},${r.table},${r.type},${r.status},${fmtTime(r.createdAt)}`)
          ].join("\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          a.download = "nexo-reporte.csv";
          a.click();
          URL.revokeObjectURL(a.href);
        }}><Download size={16} /> Exportar CSV</button>} />
      <div className="stats-grid">
        <StatCard label="Solicitudes totales" value={total} icon={ClipboardList} tone="blue" foot="Registros en Supabase" />
        <StatCard label="Solicitudes resueltas" value={done} icon={CheckCheck} tone="green" foot="Marcadas atendidas" />
        <StatCard label="Pendientes" value={state.requests.filter(r => r.status !== "atendida").length} icon={Clock3} tone="orange" foot="Por resolver" />
        <StatCard label="Antigüedad media" value={`${average} min`} icon={Timer} tone="purple" foot="Cálculo orientativo" />
      </div>
      <div className="reports-grid">
        <section className="panel">
          <div className="panel-heading"><div><h3>Solicitudes por tipo</h3><p>Distribución de los registros actuales</p></div></div>
          <div className="bar-chart">
            {byType.map(item => (
              <div className="bar-row" key={item.type}>
                <div className="bar-label"><span>{requestLabel(item.type)}</span><b>{item.count}</b></div>
                <div className="bar-track"><div style={{ width: `${item.count / max * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel report-summary">
          <div className="panel-heading"><div><h3>Estado del servicio</h3><p>Resolución de solicitudes</p></div></div>
          <div className="donut" style={{ "--progress": `${total ? done / total * 100 : 0}%` }}>
            <div><b>{total ? Math.round(done / total * 100) : 0}%</b><small>Resueltas</small></div>
          </div>
          <p className="report-caption">{done} de {total} solicitudes marcadas como atendidas.</p>
        </section>
      </div>
    </>
  );
}

function SettingsPage({ state, update, notify }) {
  const [name, setName] = useState(state.restaurant.name);

  return (
    <>
      <PageHeading eyebrow="PERSONALIZACIÓN" title="Configuración"
        desc="Ajusta los datos principales del espacio de trabajo." />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><h3>Información del restaurante</h3><p>Estos datos identifican tu espacio de trabajo.</p></div></div>
          <label className="field-label">Nombre comercial
            <input value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="field-label">Tipo de negocio
            <input value={state.restaurant.subtitle} onChange={e => update(s => {
              s.restaurant.subtitle = e.target.value;
              return s;
            })} />
          </label>
          <label className="field-label">Moneda
            <select value={state.restaurant.currency} onChange={e => update(s => {
              s.restaurant.currency = e.target.value;
              return s;
            })}>
              <option value="USD">USD — Dólar estadounidense</option>
              <option value="VES">VES — Bolívar</option>
              <option value="CLP">CLP — Peso chileno</option>
            </select>
          </label>
          <button className="button primary" onClick={() => {
            update(s => {
              s.restaurant.name = "NEXO Demo";
              return s;
            });
            setName("NEXO Demo");
            notify("El nombre del restaurante se mantiene como NEXO Demo.");
          }}>Guardar cambios</button>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading"><div><h3>Preferencias de operación</h3><p>Opciones locales de esta demostración.</p></div></div>
          <ToggleRow title="Sonido de notificaciones" desc="Preferencia local de notificaciones." value={state.settings.sound}
            onChange={v => update(s => { s.settings.sound = v; return s; })} />
          <ToggleRow title="Asignación automática" desc="Preferencia local para asignar solicitudes." value={state.settings.autoAssign}
            onChange={v => update(s => { s.settings.autoAssign = v; return s; })} />
          <div className="service-hours"><Clock3 size={17} /><div><b>Horario de servicio</b><small>{state.settings.serviceHours}</small></div></div>
        </section>

        <section className="panel danger-zone">
          <div className="panel-heading"><div><h3>Zona de mantenimiento</h3><p>Acciones sobre las preferencias locales.</p></div></div>
          <button className="button danger" onClick={() => {
            if (confirm("¿Seguro que deseas restaurar las preferencias locales?")) {
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }
          }}><RefreshCw size={15} /> Restaurar preferencias</button>
          <small>Esta acción no elimina los datos almacenados en Supabase.</small>
        </section>
      </div>
    </>
  );
}

function ToggleRow({ title, desc, value, onChange }) {
  return (
    <div className="toggle-row">
      <div><b>{title}</b><p>{desc}</p></div>
      <button className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-label={title}><i /></button>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state"><ClipboardList size={26} /><p>{text}</p></div>;
}

function Modal({ modal, setModal, state, update, notify, newStaff, setNewStaff }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => {
      if (e.target === e.currentTarget) setModal(null);
    }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Agregar persona</h3>
          <button className="icon-button" onClick={() => setModal(null)}><X size={18} /></button>
        </div>
        <label className="field-label">Nombre
          <input value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} placeholder="Nombre y apellido" />
        </label>
        <label className="field-label">Rol
          <select value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}>
            <option>Camarero</option><option>Camarera</option><option>Administradora</option><option>Supervisor</option>
          </select>
        </label>
        <button className="button primary full" onClick={() => {
          if (!newStaff.name.trim()) return;
          update(s => {
            s.staff.push({ id: Date.now(), name: newStaff.name.trim(), role: newStaff.role, active: true });
            return s;
          });
          setNewStaff({ name: "", role: "Camarero" });
          setModal(null);
          notify("Persona agregada al equipo local.");
        }}>Agregar al equipo</button>
      </div>
    </div>
  );
}

function CustomerView({ table, sent, setSent, type, setType, note, setNote, onSend, loading, error }) {
  return (
    <div className="customer-page">
      <div className="customer-top">
        <div className="brand-mark">N</div><b>NEXO<span>.</span></b>
        <span className="customer-restaurant">{table?.zone || "Restaurante"} · Servicio en mesa</span>
      </div>
      <div className="customer-card">
        <div className="customer-welcome-icon"><Utensils size={23} /></div>
        <div className="eyebrow">BIENVENIDO/A</div>
        <h1>Estamos para atenderte.</h1>
        <p>Selecciona lo que necesitas y enviaremos tu solicitud a nuestro equipo.</p>
        <div className="customer-table">MESA <b>{String(table?.number || "").padStart(2, "0")}</b></div>

        {sent ? (
          <div className="success-panel">
            <div><CheckCheck size={27} /></div>
            <h2>¡Solicitud enviada!</h2>
            <p>El equipo recibió tu aviso. En breve se acercará a tu mesa.</p>
            <button className="button secondary full" onClick={() => {
              setSent(false);
              setNote("");
            }}>Enviar otra solicitud</button>
          </div>
        ) : (
          <>
            <div className="customer-options">
              <button className={type === "atencion" ? "chosen" : ""} onClick={() => setType("atencion")}>
                <span><Bell size={19} /></span><b>Llamar al camarero</b><small>Necesito ayuda o atención</small>
              </button>
              <button className={type === "cuenta" ? "chosen" : ""} onClick={() => setType("cuenta")}>
                <span><Wallet size={19} /></span><b>Solicitar la cuenta</b><small>Quiero pagar mi consumo</small>
              </button>
              <button className={type === "pedido" ? "chosen" : ""} onClick={() => setType("pedido")}>
                <span><Utensils size={19} /></span><b>Hacer un pedido</b><small>Quiero pedir algo más</small>
              </button>
            </div>
            <label className="field-label customer-note">Mensaje adicional <span>(opcional)</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Escribe aquí si necesitas algo específico..." rows="3" />
            </label>
            {error && <p style={{ color: "#ef4444" }}>{error}</p>}
            <button className="button customer-send full" onClick={onSend} disabled={loading}>
              {loading ? "Enviando..." : "Enviar solicitud"} <ArrowUpRight size={17} />
            </button>
          </>
        )}
        <div className="customer-secure"><ShieldCheck size={14} />Tu solicitud se envía de forma segura al restaurante.</div>
      </div>
      <footer>Atención conectada por <b>NEXO.</b></footer>
    </div>
  );
}

export default App;
