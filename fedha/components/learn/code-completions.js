import { snippetCompletion } from '@codemirror/autocomplete';

// Suggestions that run entirely in the browser (no server, no AI). CodeMirror's own language support already
// completes keywords, built-ins and the names in the file. This adds: Python data-science / ML libraries
// (numpy, pandas, matplotlib, seaborn, scikit-learn, PyTorch, TensorFlow/Keras) with the aliases you imported,
// methods on DataFrames, arrays and models, names from your other lab files, and ready-made snippets.

const list = (s) => s.split(/\s+/).filter(Boolean);
const opt = (names, detail, type) => list(names).map((n) => ({ label: n, detail, type: type || (/^[A-Z]/.test(n) ? 'class' : 'function') }));

// ── What each module offers after "alias." ───────────────────────────────────────────────────────────
const MEMBERS = {
  numpy: 'array zeros ones empty full eye arange linspace reshape concatenate stack vstack hstack split mean median std var sum prod min max argmin argmax argsort sort unique where clip abs sqrt exp log log2 log10 sin cos tan dot matmul transpose round floor ceil cumsum cumprod diff isnan isinf nan inf pi e random linalg testing shape ndim size dtype float32 float64 int32 int64 bool_ asarray copy expand_dims squeeze flatten ravel allclose isclose logical_and logical_or percentile quantile corrcoef cov histogram meshgrid tile repeat take save load savetxt loadtxt newaxis',
  'numpy.random': 'rand randn randint random seed choice shuffle permutation normal uniform binomial poisson default_rng',
  'numpy.linalg': 'norm inv det eig svd solve pinv matrix_rank qr cholesky',
  pandas: 'DataFrame Series read_csv read_excel read_json read_parquet read_sql concat merge get_dummies to_datetime to_numeric cut qcut pivot_table crosstab isna notna unique date_range Categorical NA NaT set_option options',
  'matplotlib.pyplot': 'plot scatter bar barh hist boxplot pie imshow show figure subplots subplot title xlabel ylabel xlim ylim legend grid savefig tight_layout colorbar axhline axvline fill_between text annotate xticks yticks style close clf cla suptitle semilogx semilogy errorbar',
  seaborn: 'histplot kdeplot boxplot violinplot barplot countplot scatterplot lineplot heatmap pairplot jointplot regplot catplot displot set_theme set_style load_dataset color_palette FacetGrid',
  torch: 'tensor zeros ones rand randn arange linspace cat stack matmul mm mean sum max min argmax sqrt exp log relu sigmoid softmax no_grad manual_seed save load device cuda from_numpy float32 long nn optim utils autograd',
  'torch.nn': 'Module Linear Conv2d Conv1d MaxPool2d AvgPool2d BatchNorm1d BatchNorm2d Dropout ReLU Sigmoid Tanh Softmax LSTM GRU RNN Embedding Flatten Sequential ModuleList CrossEntropyLoss MSELoss BCELoss BCEWithLogitsLoss L1Loss NLLLoss functional init',
  'torch.optim': 'SGD Adam AdamW RMSprop Adagrad lr_scheduler',
  'torch.utils.data': 'Dataset DataLoader TensorDataset random_split',
  tensorflow: 'constant Variable keras random math data GradientTape function reduce_mean reduce_sum cast float32 int32 convert_to_tensor zeros ones reshape expand_dims squeeze concat stack argmax nn config',
  keras: 'Sequential Model Input layers models optimizers losses metrics callbacks datasets utils regularizers activations',
  'keras.layers': 'Dense Conv2D Conv1D MaxPooling2D AveragePooling2D Dropout Flatten BatchNormalization LSTM GRU Embedding Input Activation Reshape GlobalAveragePooling2D SimpleRNN Bidirectional',
  sklearn: 'model_selection metrics preprocessing linear_model ensemble tree svm neighbors cluster decomposition pipeline impute datasets naive_bayes',
};
MEMBERS['tensorflow.keras'] = MEMBERS.keras;
MEMBERS['tensorflow.keras.layers'] = MEMBERS['keras.layers'];
MEMBERS['torch.nn.functional'] = 'relu sigmoid softmax log_softmax cross_entropy mse_loss binary_cross_entropy dropout max_pool2d conv2d tanh gelu leaky_relu';

// ── "from x import |" ───────────────────────────────────────────────────────────────────────────────
const FROM = {
  'sklearn.model_selection': 'train_test_split cross_val_score cross_validate GridSearchCV RandomizedSearchCV KFold StratifiedKFold learning_curve',
  'sklearn.metrics': 'accuracy_score precision_score recall_score f1_score confusion_matrix classification_report roc_auc_score roc_curve mean_squared_error mean_absolute_error r2_score log_loss ConfusionMatrixDisplay',
  'sklearn.preprocessing': 'StandardScaler MinMaxScaler RobustScaler LabelEncoder OneHotEncoder OrdinalEncoder PolynomialFeatures Normalizer',
  'sklearn.linear_model': 'LinearRegression LogisticRegression Ridge Lasso ElasticNet SGDClassifier',
  'sklearn.ensemble': 'RandomForestClassifier RandomForestRegressor GradientBoostingClassifier GradientBoostingRegressor AdaBoostClassifier VotingClassifier BaggingClassifier',
  'sklearn.tree': 'DecisionTreeClassifier DecisionTreeRegressor plot_tree export_text',
  'sklearn.svm': 'SVC SVR LinearSVC',
  'sklearn.neighbors': 'KNeighborsClassifier KNeighborsRegressor',
  'sklearn.cluster': 'KMeans DBSCAN AgglomerativeClustering',
  'sklearn.decomposition': 'PCA TruncatedSVD NMF',
  'sklearn.pipeline': 'Pipeline make_pipeline',
  'sklearn.impute': 'SimpleImputer KNNImputer',
  'sklearn.naive_bayes': 'GaussianNB MultinomialNB BernoulliNB',
  'sklearn.datasets': 'load_iris load_digits load_wine load_breast_cancer make_classification make_regression make_blobs fetch_california_housing',
  'torch.utils.data': 'Dataset DataLoader TensorDataset random_split',
  torch: 'nn optim tensor',
  'torch.nn': 'Module Linear Conv2d ReLU Sequential CrossEntropyLoss MSELoss Dropout BatchNorm2d LSTM',
  'torch.optim': 'SGD Adam AdamW',
  'tensorflow.keras.models': 'Sequential Model load_model',
  'tensorflow.keras.layers': 'Dense Conv2D MaxPooling2D Dropout Flatten LSTM Embedding Input',
  'tensorflow.keras.optimizers': 'Adam SGD RMSprop',
  'tensorflow.keras.callbacks': 'EarlyStopping ModelCheckpoint ReduceLROnPlateau TensorBoard',
  'matplotlib': 'pyplot cm colors',
  collections: 'Counter defaultdict deque OrderedDict namedtuple',
  typing: 'List Dict Tuple Optional Union Any Callable',
  itertools: 'permutations combinations product chain groupby accumulate',
  functools: 'lru_cache reduce partial wraps',
  dataclasses: 'dataclass field',
  datetime: 'datetime date timedelta timezone',
  math: 'sqrt pi e sin cos tan log exp floor ceil factorial gcd inf',
};

const MODULES = 'numpy pandas matplotlib matplotlib.pyplot seaborn scipy sklearn torch torchvision tensorflow keras xgboost lightgbm nltk spacy requests bs4 json csv os sys re math random time datetime collections itertools functools typing dataclasses pathlib statistics string heapq bisect copy pickle sqlite3 urllib argparse logging unittest asyncio threading'.split(' ');
const ALIAS = { np: 'numpy', pd: 'pandas', plt: 'matplotlib.pyplot', sns: 'seaborn', tf: 'tensorflow', nn: 'torch.nn', F: 'torch.nn.functional', optim: 'torch.optim' };

// ── Methods on things you've made ───────────────────────────────────────────────────────────────────
const DF = 'head tail info describe shape columns index dtypes values copy drop dropna fillna isna isnull notna sort_values sort_index groupby agg apply map merge join concat pivot_table melt reset_index set_index rename loc iloc at iat query eval astype to_csv to_numpy to_dict corr cov mean median std var sum min max count nunique unique value_counts duplicated drop_duplicates sample nlargest nsmallest cumsum diff shift rolling expanding plot hist boxplot T transpose clip replace isin between where mask str dt cat select_dtypes memory_usage empty size ndim';
const ARR = 'shape ndim size dtype T reshape flatten ravel astype copy mean std var sum min max argmin argmax argsort sort cumsum dot transpose squeeze clip round tolist item any all nonzero fill take repeat';
const MODEL = 'fit predict predict_proba predict_log_proba score transform fit_transform inverse_transform get_params set_params decision_function feature_importances_ coef_ intercept_ classes_ n_features_in_ feature_names_in_ best_params_ best_score_ best_estimator_ cv_results_ evals_result summary compile evaluate save load_weights save_weights history layers parameters named_parameters train eval zero_grad state_dict load_state_dict to cuda cpu forward children modules';
const TENSOR = 'shape dtype device size view reshape permute transpose squeeze unsqueeze flatten float long int double to cpu cuda numpy item tolist detach clone backward grad requires_grad_ mean sum max min argmax softmax sigmoid relu matmul mm add_ mul_ zero_ T';

function aliasesOf(text) {
  const map = { ...ALIAS };
  for (const m of text.matchAll(/^[ \t]*import[ \t]+([^\n#]+)/gm)) {
    for (const part of m[1].split(',')) { const x = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part); if (x) map[x[2] || x[1].split('.')[0]] = x[2] ? x[1] : x[1].split('.')[0]; }
  }
  for (const m of text.matchAll(/^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+([^\n#(]+)/gm)) {
    for (const part of m[2].split(',')) { const x = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part); if (x) map[x[2] || x[1]] = `${m[1]}.${x[1]}`; }
  }
  return map;
}

function kindOf(name, text) {
  const rhs = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*([^\\n]+)`, 'm').exec(text)?.[1] || '';
  if (/read_(csv|excel|json|parquet|sql)|DataFrame\(|\.groupby\(|get_dummies\(/.test(rhs) || /^(df|data|dataset|train|test|raw)\w*$/i.test(name)) return [DF, 'DataFrame'];
  if (/\b(torch|tf)\.\w+\(|\.to\(|\.view\(/.test(rhs)) return [TENSOR, 'tensor'];
  if (/\bnp\.\w+\(|numpy\.\w+\(/.test(rhs) || /^(arr|array|a|b|y_?\w*)$/.test(name)) return [ARR, 'array'];
  if (/^[A-Z]\w*\(/.test(rhs) || /^(model|clf|reg|net|scaler|pipe|pipeline|encoder|km|pca)\w*$/i.test(name)) return [MODEL, 'model'];
  if (/^X(_\w+)?$/.test(name)) return [`${DF} ${ARR}`, 'DataFrame / array'];
  return null;
}

// Python: imports, "alias.", and methods on your variables.
export function pythonLibrarySource(ctx) {
  const { state, pos } = ctx;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  let m;
  if ((m = /^\s*from\s+([\w.]+)\s+import\s+(?:[\w\s,]*,\s*)?(\w*)$/.exec(before))) {
    const names = FROM[m[1]]; if (!names) return null;
    return { from: pos - m[2].length, options: opt(names, m[1]), validFor: /^\w*$/ };
  }
  if ((m = /^\s*(?:import|from)\s+(?:[\w\s,.]*,\s*)?([\w.]*)$/.exec(before))) {
    return { from: pos - m[1].length, options: MODULES.map((n) => ({ label: n, type: 'namespace', detail: 'module' })), validFor: /^[\w.]*$/ };
  }
  if ((m = /([A-Za-z_][\w.]*|[\])])\.(\w*)$/.exec(before))) {
    const obj = m[1], from = pos - m[2].length;
    if (obj === ']' || obj === ')') return { from, options: opt(DF, 'pandas / array'), validFor: /^\w*$/ };
    const text = state.doc.toString();
    const [head, ...rest] = obj.split('.');
    const mod = aliasesOf(text)[head];
    if (mod) {
      const key = [mod, ...rest].join('.');
      const names = MEMBERS[key]; if (names) return { from, options: opt(names, key), validFor: /^\w*$/ };
      return null;
    }
    if (!rest.length) { const k = kindOf(head, text); if (k) return { from, options: opt(k[0], k[1]), validFor: /^\w*$/ }; }
    return null;
  }
  return null;
}

// Names from your other lab files (functions, classes, top-level variables, and the files as modules).
export function filesSource(getOthers) {
  return (ctx) => {
    const w = ctx.matchBefore(/\w+/);
    if (!w && !ctx.explicit) return null;
    if (w && w.from > 0 && ctx.state.sliceDoc(w.from - 1, w.from) === '.') return null;
    const seen = new Set(), options = [];
    for (const f of getOthers()) {
      const src = f.content || '';
      const mod = f.name.replace(/\.\w+$/, '');
      if (!seen.has(mod)) { seen.add(mod); options.push({ label: mod, type: 'namespace', detail: f.name }); }
      for (const x of src.matchAll(/^(?:def|class|async def|function|export function|export const|const|let|var)\s+(\w+)/gm)) if (!seen.has(x[1])) { seen.add(x[1]); options.push({ label: x[1], type: 'function', detail: f.name }); }
      for (const x of src.matchAll(/^([A-Za-z_]\w*)\s*=/gm)) if (!seen.has(x[1])) { seen.add(x[1]); options.push({ label: x[1], type: 'variable', detail: f.name }); }
    }
    return options.length ? { from: w ? w.from : ctx.pos, options, validFor: /^\w*$/ } : null;
  };
}

const sn = (template, label, detail) => snippetCompletion(template, { label, detail, type: 'snippet', boost: -1 });
const PY_SNIPPETS = [
  sn('def ${name}(${args}):\n    ${}', 'def', 'function'),
  sn('class ${Name}:\n    def __init__(self${}):\n        ${}', 'class', 'class'),
  sn('for ${i} in range(${n}):\n    ${}', 'for', 'loop'),
  sn('for ${item} in ${items}:\n    ${}', 'foreach', 'loop'),
  sn('if ${cond}:\n    ${}\nelse:\n    ${}', 'ifelse', 'if / else'),
  sn('while ${cond}:\n    ${}', 'while', 'loop'),
  sn('try:\n    ${}\nexcept ${Exception} as e:\n    print(e)', 'try', 'try / except'),
  sn('with open(${"file.txt"}) as f:\n    ${}', 'with', 'open a file'),
  sn('[${x} for ${x} in ${items}]', 'listcomp', 'list comprehension'),
  sn('if __name__ == "__main__":\n    ${main()}', 'main', 'entry point'),
  sn('import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt', 'mlimports', 'ML imports'),
  sn('X_train, X_test, y_train, y_test = train_test_split(${X}, ${y}, test_size=0.2, random_state=42)', 'split', 'ML: train / test split'),
  sn('model = ${RandomForestClassifier}()\nmodel.fit(X_train, y_train)\nprint(model.score(X_test, y_test))', 'fitscore', 'ML: fit and score'),
  sn('scaler = StandardScaler()\nX_train = scaler.fit_transform(X_train)\nX_test = scaler.transform(X_test)', 'scale', 'ML: scale features'),
  sn('df = pd.read_csv(${"data.csv"})\nprint(df.head())\nprint(df.info())', 'readcsv', 'pandas: load a CSV'),
  sn('plt.figure(figsize=(${8}, ${5}))\nplt.plot(${x}, ${y})\nplt.xlabel(${"x"})\nplt.ylabel(${"y"})\nplt.show()', 'plot', 'matplotlib: line plot'),
  sn('for epoch in range(${epochs}):\n    for xb, yb in ${loader}:\n        optimizer.zero_grad()\n        loss = loss_fn(model(xb), yb)\n        loss.backward()\n        optimizer.step()\n    print(epoch, loss.item())', 'trainloop', 'PyTorch: training loop'),
  sn('class ${Net}(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.fc = nn.Linear(${in_f}, ${out_f})\n\n    def forward(self, x):\n        return self.fc(x)', 'torchmodel', 'PyTorch: model'),
  sn('model = keras.Sequential([\n    layers.Dense(${64}, activation="relu"),\n    layers.Dense(${1}),\n])\nmodel.compile(optimizer="adam", loss=${"mse"})\nmodel.fit(${X}, ${y}, epochs=${10})', 'kerasmodel', 'Keras: model'),
];
const JS_SNIPPETS = [
  sn('function ${name}(${args}) {\n  ${}\n}', 'fn', 'function'),
  sn('const ${name} = (${args}) => {\n  ${}\n};', 'arrow', 'arrow function'),
  sn('for (let ${i} = 0; ${i} < ${n}; ${i}++) {\n  ${}\n}', 'forloop', 'loop'),
  sn('for (const ${item} of ${items}) {\n  ${}\n}', 'forof', 'loop'),
  sn('try {\n  ${}\n} catch (${err}) {\n  console.error(${err});\n}', 'trycatch', 'try / catch'),
  sn('const ${res} = await fetch(${url});\nconst ${data} = await ${res}.json();', 'fetchjson', 'fetch JSON'),
  sn('console.log(${});', 'log', 'console.log'),
];

export function snippetsSource(language) {
  const items = language === 'python' ? PY_SNIPPETS : language === 'javascript' ? JS_SNIPPETS : [];
  return (ctx) => {
    if (!items.length) return null;
    const w = ctx.matchBefore(/\w+/);
    if (!w || (w.to - w.from < 2 && !ctx.explicit)) return null;
    if (w.from > 0 && ctx.state.sliceDoc(w.from - 1, w.from) === '.') return null;
    return { from: w.from, options: items, validFor: /^\w*$/ };
  };
}
