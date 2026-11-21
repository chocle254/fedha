// "What comes next" for ML code. Reads the Python in the file and suggests the next whole block, the way a
// data scientist would work: load -> explore -> clean -> encode -> features/target -> split -> scale -> model ->
// fit -> evaluate -> improve (and the PyTorch / Keras versions of the training steps). Pure rules, no AI, no
// network: it only looks at which steps your code already has. Templates use CodeMirror snippet fields:
// ${1:name} is a spot you overtype, Tab (or the key bar's next-field button) jumps to the next one.

const has = (c, re) => re.test(c);
const importedFrom = (c, name) => new RegExp(`^[ \\t]*(?:from[ \\t]+\\S+[ \\t]+)?import[ \\t]+[^\\n]*\\b${name}\\b`, 'm').test(c);
// Adds "from module import a, b" for only the names the file does not import yet.
const need = (c, module, names) => { const miss = names.filter((n) => !importedFrom(c, n)); return miss.length ? `from ${module} import ${miss.join(', ')}\n` : ''; };

const CLF = /Classifier|LogisticRegression|SVC|GaussianNB|MultinomialNB|BernoulliNB/;
const CLUSTER = /KMeans|DBSCAN|AgglomerativeClustering/;
const ESTIMATOR = /^(\w+)[ \t]*=[ \t]*([A-Za-z]*(?:Classifier|Regressor|Regression|Ridge|Lasso|ElasticNet|SVC|SVR|KMeans|DBSCAN|AgglomerativeClustering|GaussianNB|MultinomialNB|BernoulliNB))\(/m;

function read(code) {
  const pd = /import[ \t]+pandas[ \t]+as[ \t]+(\w+)/.exec(code)?.[1] || 'pd';
  const dfLoad = /^(\w+)[ \t]*=[ \t]*\w+\.(?:read_(?:csv|excel|json|parquet)|DataFrame)\(/m.exec(code);
  const est = ESTIMATOR.exec(code);
  const split = /^(\w+)[ \t]*,[ \t]*(\w+)[ \t]*,[ \t]*(\w+)[ \t]*,[ \t]*(\w+)[ \t]*=[ \t]*train_test_split\(/m.exec(code);
  return {
    code, pd, df: dfLoad?.[1] || 'df', hasData: !!dfLoad || has(code, /\b(load_\w+|make_\w+|fetch_\w+)\(/),
    est: est ? { name: est[1], cls: est[2], kind: CLF.test(est[2]) ? 'clf' : CLUSTER.test(est[2]) ? 'cluster' : 'reg' } : null,
    net: /class[ \t]+(\w+)\([ \t]*(?:torch\.)?nn\.Module[ \t]*\)/.exec(code)?.[1] || null,
    keras: has(code, /keras/) ? (/(\w+)[ \t]*=[ \t]*(?:\w+\.)*(?:Sequential|Model)\(/.exec(code)?.[1] || null) : null,
    split: split ? { Xtr: split[1], Xte: split[2], ytr: split[3], yte: split[4] } : null,
    tree: /RandomForest|GradientBoosting|DecisionTree|ExtraTrees|XGB|LGBM/.test(code),
  };
}

const step = (id, title, text) => ({ id, title, text });

export function stagesOf(c) {
  const { code, pd, df } = c; const s = c.split || { Xtr: 'X_train', Xte: 'X_test', ytr: 'y_train', yte: 'y_test' };
  const m = c.est?.name || 'model';
  const out = [];
  const add = (...steps) => out.push(steps);

  // ── data ──
  if (!has(code, /^[ \t]*(?:import|from)[ \t]/m)) add(step('imports', 'Imports for ML', `import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\nfrom sklearn.model_selection import train_test_split\n`));
  if (!c.hasData && !c.net && !c.keras) add(step('load', 'Load the dataset', `# Load the dataset\n${df} = ${pd}.read_csv("\${1:data.csv}")\nprint(${df}.shape)\nprint(${df}.head())\n`));
  if (c.hasData && !c.split && has(code, new RegExp(`\\b${df}\\b`))) {
    if (!has(code, /\.(info|describe)\(/)) add(step('explore', 'Explore the data', `# Explore the data\nprint(${df}.shape)\nprint(${df}.info())\nprint(${df}.describe())\nprint(${df}.isna().sum())\n`));
    if (!has(code, /\.(fillna|dropna|drop_duplicates)\(|SimpleImputer/)) add(step('clean', 'Clean the data', `# Clean the data\n${df} = ${df}.drop_duplicates()\nnum_cols = ${df}.select_dtypes(include="number").columns\ncat_cols = ${df}.select_dtypes(exclude="number").columns\n${df}[num_cols] = ${df}[num_cols].fillna(${df}[num_cols].median())\nfor col in cat_cols:\n    ${df}[col] = ${df}[col].fillna(${df}[col].mode()[0])\n`));
    const cleaned = has(code, /\.(fillna|dropna|drop_duplicates)\(/);
    const looked = has(code, /\.hist\(|heatmap\(|\.corr\(|\.plot\(|plt\.(hist|scatter|plot|bar)/), summed = has(code, /\.groupby\(|pivot_table\(|value_counts\(/);
    const eda = [];
    if (cleaned && !looked) eda.push(step('plot', 'Plot the data', `# Look at the data\n${df}.hist(figsize=(10, 8))\nplt.tight_layout()\nplt.show()\nprint(${df}.corr(numeric_only=True))\n`));
    if (cleaned && !summed) eda.push(step('summarise', 'Group and summarise', `# Summarise by group\nsummary = ${df}.groupby("\${1:category}")["\${2:value}"].agg(["count", "mean", "median", "max"]).sort_values("mean", ascending=False)\nprint(summary)\nsummary["mean"].plot(kind="bar")\nplt.tight_layout()\nplt.show()\n`));
    if (eda.length) add(...eda);
    const enc = [];
    if (cleaned && !has(code, /get_dummies\(|LabelEncoder|OneHotEncoder|OrdinalEncoder/)) enc.push(step('encode', 'Encode categories', `# Turn text columns into numbers\ncat_cols = ${df}.select_dtypes(exclude="number").columns.drop("\${1:target}", errors="ignore")\n${df} = ${pd}.get_dummies(${df}, columns=cat_cols, drop_first=True)\n`));
    if (cleaned && !has(code, /\.to_csv\(/)) enc.push(step('savecsv', 'Save the cleaned data', `# Save the cleaned data\n${df}.to_csv("\${1:clean_data.csv}", index=False)\n`));
    if (enc.length) add(...enc);
    if (!has(code, /^X[ \t]*=/m) && has(code, /\.(fillna|dropna|drop_duplicates)\(/)) add(step('features', 'Features and target', `# Features (X) and target (y)\nX = ${df}.drop("\${1:target}", axis=1)\ny = ${df}["\${1:target}"]\n`));
  }
  if ((has(code, /^X[ \t]*=/m) || (c.hasData && has(code, /\b(data|iris|digits|wine)\.(data|target)\b/))) && !c.split && !has(code, /train_test_split\(/)) {
    add(step('split', 'Train / test split', `${need(code, 'sklearn.model_selection', ['train_test_split'])}# Split into training and test sets\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=\${1:0.2}, random_state=42)\n`));
  }
  // ── model ──
  if (c.split && !has(code, /Scaler\(/) && !c.est && !c.net && !c.keras) add(step('scale', 'Scale the features', `${need(code, 'sklearn.preprocessing', ['StandardScaler'])}# Scale the features (fit on the training data only)\nscaler = StandardScaler()\n${s.Xtr} = scaler.fit_transform(${s.Xtr})\n${s.Xte} = scaler.transform(${s.Xte})\n`));
  if (c.split && !c.est && !c.net && !c.keras) add(
    step('clf', 'Classifier', `${need(code, 'sklearn.ensemble', ['RandomForestClassifier'])}# Create the model\nmodel = RandomForestClassifier(n_estimators=\${1:200}, random_state=42)\n`),
    step('reg', 'Regressor', `${need(code, 'sklearn.ensemble', ['RandomForestRegressor'])}# Create the model\nmodel = RandomForestRegressor(n_estimators=\${1:200}, random_state=42)\n`),
    step('torch', 'Neural net (PyTorch)', `import torch\nimport torch.nn as nn\nimport torch.optim as optim\nfrom torch.utils.data import DataLoader, TensorDataset\n\n# A small neural network\nclass Net(nn.Module):\n    def __init__(self, n_in, n_out):\n        super().__init__()\n        self.layers = nn.Sequential(\n            nn.Linear(n_in, \${1:64}), nn.ReLU(),\n            nn.Linear(\${1:64}, n_out),\n        )\n\n    def forward(self, x):\n        return self.layers(x)\n`),
  );
  if (c.est && !has(code, new RegExp(`\\b${m}\\.fit(?:_predict|_transform)?\\(`))) add(step('fit', 'Fit the model', c.est.kind === 'cluster' ? `# Fit the model\n${m}.fit(${c.split ? s.Xtr : 'X'})\nlabels = ${m}.labels_\n` : `# Train the model\n${m}.fit(${s.Xtr}, ${s.ytr})\n`));
  if (c.est && has(code, new RegExp(`\\b${m}\\.fit`))) {
    if (c.est.kind === 'clf' && !has(code, /accuracy_score|classification_report|confusion_matrix|\.score\(/)) add(step('eval', 'Evaluate (classification)', `${need(code, 'sklearn.metrics', ['accuracy_score', 'classification_report', 'confusion_matrix'])}# Predict and evaluate\ny_pred = ${m}.predict(${s.Xte})\nprint("Accuracy:", accuracy_score(${s.yte}, y_pred))\nprint(classification_report(${s.yte}, y_pred))\nprint(confusion_matrix(${s.yte}, y_pred))\n`));
    if (c.est.kind === 'reg' && !has(code, /mean_squared_error|r2_score|mean_absolute_error|\.score\(/)) add(step('eval', 'Evaluate (regression)', `${need(code, 'sklearn.metrics', ['mean_absolute_error', 'mean_squared_error', 'r2_score'])}# Predict and evaluate\ny_pred = ${m}.predict(${s.Xte})\nprint("MAE:", mean_absolute_error(${s.yte}, y_pred))\nprint("RMSE:", mean_squared_error(${s.yte}, y_pred) ** 0.5)\nprint("R2:", r2_score(${s.yte}, y_pred))\n`));
    if (c.est.kind === 'cluster' && !has(code, /silhouette_score/)) add(step('eval', 'Evaluate clusters', `${need(code, 'sklearn.metrics', ['silhouette_score'])}# How well separated are the clusters?\nprint("Silhouette:", silhouette_score(${c.split ? s.Xtr : 'X'}, labels))\n`));
    if (c.est.kind !== 'cluster' && has(code, /accuracy_score|mean_squared_error|r2_score|\.score\(/)) {
      const extra = [];
      if (!has(code, /cross_val_score|cross_validate/)) extra.push(step('cv', 'Cross-validation', `${need(code, 'sklearn.model_selection', ['cross_val_score'])}# Cross-validation: a more honest score\nscores = cross_val_score(${m}, ${c.split ? 'X' : 'X'}, y, cv=\${1:5})\nprint(scores.mean(), "+/-", scores.std())\n`));
      if (c.tree && !has(code, /feature_importances_/)) extra.push(step('importance', 'Feature importance', `# Which features matter most?\nimportances = ${pd}.Series(${m}.feature_importances_, index=${s.Xtr}.columns).sort_values(ascending=False)\nprint(importances.head(10))\nimportances.head(10).plot(kind="barh")\nplt.show()\n`));
      if (!has(code, /GridSearchCV|RandomizedSearchCV/)) extra.push(step('tune', 'Tune the model', `${need(code, 'sklearn.model_selection', ['GridSearchCV'])}# Search for better settings\nparam_grid = {"n_estimators": [100, 200, 300], "max_depth": [None, 5, 10]}\nsearch = GridSearchCV(${m}, param_grid, cv=3, n_jobs=-1)\nsearch.fit(${s.Xtr}, ${s.ytr})\nprint(search.best_params_, search.best_score_)\n`));
      if (!has(code, /joblib|pickle/)) extra.push(step('save', 'Save the model', `import joblib\n\n# Save the trained model\njoblib.dump(${m}, "\${1:model.joblib}")\n`));
      if (extra.length) add(...extra.slice(0, 3));
    }
  }
  // ── PyTorch ──
  if (c.net) {
    if (!has(code, /DataLoader\(/)) add(step('loader', 'DataLoaders', `# Wrap the data in DataLoaders\ntrain_loader = DataLoader(TensorDataset(torch.tensor(${s.Xtr}.values, dtype=torch.float32), torch.tensor(${s.ytr}.values, dtype=torch.long)), batch_size=\${1:32}, shuffle=True)\ntest_loader = DataLoader(TensorDataset(torch.tensor(${s.Xte}.values, dtype=torch.float32), torch.tensor(${s.yte}.values, dtype=torch.long)), batch_size=\${1:32})\n`));
    if (!has(code, /optim\.\w+\(/)) add(step('opt', 'Loss and optimizer', `# Model, loss and optimizer\nmodel = ${c.net}(\${1:n_in}, \${2:n_out})\nloss_fn = nn.CrossEntropyLoss()\noptimizer = optim.Adam(model.parameters(), lr=\${3:1e-3})\n`));
    else if (!has(code, /loss\.backward\(\)/)) add(step('loop', 'Training loop', `# Training loop\nfor epoch in range(\${1:10}):\n    model.train()\n    total = 0\n    for xb, yb in train_loader:\n        optimizer.zero_grad()\n        loss = loss_fn(model(xb), yb)\n        loss.backward()\n        optimizer.step()\n        total += loss.item()\n    print(f"epoch {epoch + 1}: loss {total / len(train_loader):.4f}")\n`));
    else if (!has(code, /model\.eval\(\)/)) add(step('torcheval', 'Evaluate the net', `# Evaluate\nmodel.eval()\ncorrect = 0\nwith torch.no_grad():\n    for xb, yb in test_loader:\n        correct += (model(xb).argmax(dim=1) == yb).sum().item()\nprint("Accuracy:", correct / len(test_loader.dataset))\n`));
    else if (!has(code, /torch\.save/)) add(step('torchsave', 'Save the weights', `torch.save(model.state_dict(), "\${1:model.pt}")\n`));
  }
  // ── Keras ──
  if (c.keras) {
    const k = c.keras;
    if (!has(code, /\.compile\(/)) add(step('compile', 'Compile (Keras)', `${k}.compile(optimizer="adam", loss="\${1:sparse_categorical_crossentropy}", metrics=["accuracy"])\n`));
    else if (!has(code, new RegExp(`\\b${k}\\.fit\\(`))) add(step('kfit', 'Train (Keras)', `history = ${k}.fit(${s.Xtr}, ${s.ytr}, epochs=\${1:20}, batch_size=\${2:32}, validation_split=0.2)\n`));
    else if (!has(code, /\.evaluate\(/)) add(step('keval', 'Evaluate (Keras)', `loss, acc = ${k}.evaluate(${s.Xte}, ${s.yte})\nprint("Test accuracy:", acc)\n`));
  }
  return out;
}

// The steps to offer now: the next stage (up to 3 choices) plus the first choice of the stage after it.
export function nextSteps(code) {
  if (typeof code !== 'string') return [];
  if (code.length > 60000) return [];
  const st = stagesOf(read(code));
  if (!st.length) return [];
  const first = st[0].slice(0, 3);
  return st[1] && first.length < 3 ? [...first, st[1][0]] : first;
}

export const mlStages = (code) => stagesOf(read(code));
