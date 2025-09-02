# PGB (Pangenome Browser)
[![Netlify Status](https://api.netlify.com/api/v1/badges/8de8a9e9-655d-4571-bf43-a735a78b840c/deploy-status)](https://app.netlify.com/projects/pgb-site/deploys)

A web-based 3D visualization tool for exploring pangenome data.

## Overview

This project provides an interactive 3D visualization interface for exploring pangenome data. It allows users to load and visualize genomic data from various sources, with support for both large and small data files.

## Features

- Interactive 2D visualization
- Support for loading genomic data from URLs
- Pre-configured data file options for quick access

## Prerequisites

- Node.js (latest LTS version recommended)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd pgb
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Development

To start the development server:
```bash
npm run dev
```

This will start the Vite development server, typically at `http://localhost:5173`

### Building for Production

To create a production build:
```bash
npm run build
```

### Preview Production Build

To preview the production build locally:
```bash
npm run preview
```

## Project Structure

- `src/` - Source code directory
- `public/` - Static assets
- `index.html` - Main HTML file
- `vite.config.js` - Vite configuration
- `package.json` - Project dependencies and scripts

## Technologies Used

- [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- [Three.js](https://threejs.org/) - JavaScript 3D library
- [Bootstrap](https://getbootstrap.com/) - CSS framework
- [Sass](https://sass-lang.com/) - CSS preprocessor

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here] 
