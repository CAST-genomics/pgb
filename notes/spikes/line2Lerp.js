import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

document.addEventListener("DOMContentLoaded",  (event) => {

    const worldWidth = 10;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(6, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x696969);

    document.body.appendChild(renderer.domElement);

    const sliderContainer = document.createElement('div');
    document.body.appendChild(sliderContainer);

    sliderContainer.style.position = 'absolute';
    sliderContainer.style.top = '20px';
    sliderContainer.style.left = '20px';
    sliderContainer.style.zIndex = '1000';
    sliderContainer.style.color = 'white';
    sliderContainer.style.fontFamily = 'Arial, sans-serif';
    sliderContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    sliderContainer.style.padding = '10px';
    sliderContainer.style.borderRadius = '5px';

    const label = document.createElement('label');
    sliderContainer.appendChild(label);

    label.textContent = 'Morph Weight: ';
    label.style.marginRight = '10px';

    const slider = document.createElement('input');
    sliderContainer.appendChild(slider);

    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '0';
    slider.style.width = '200px';

    const valueDisplay = document.createElement('span');
    sliderContainer.appendChild(valueDisplay);

    valueDisplay.textContent = '0.00';
    valueDisplay.style.marginLeft = '10px';

    const material = new LineMaterial({ color: 0x00ff88, linewidth: 3 });

    const divisions = 64;
    const geometry = new LineGeometry();

    const numKnots = 20;

    const spline = new THREE.CatmullRomCurve3(createKnots(numKnots, 2, worldWidth));
    const points = spline.getPoints(divisions);
    const xyz = points.flatMap(p => [p.x, p.y, p.z]);
    geometry.setPositions(xyz);

    const bbox = calculateBoundingBox(points);

    const line = new Line2(geometry, material);
    scene.add(line);

    const sineKnots = createKnots(numKnots, 2, worldWidth);
    addKnotVisualization(scene, sineKnots, 0xff0000); // Red spheres for sine knots
    addDerivedPointsVisualization(scene, points, 0xffff00); // Yellow spheres for derived points

    const straightKnots = createHorizontalKnots(numKnots, bbox.centroid.y, 1.5*(bbox.max.x - bbox.min.x));
    const splineTarget = new THREE.CatmullRomCurve3(straightKnots);
    const pointsTarget = splineTarget.getPoints(divisions);
    const xyzTarget = pointsTarget.flatMap(({ x, y, z }) => [x, y, z]);

    addKnotVisualization(scene, straightKnots, 0x00ff00); // Green spheres for straight knots
    addDerivedPointsVisualization(scene, pointsTarget, 0x00ffff); // Cyan spheres for target derived points

    slider.addEventListener('input', () => doLerp(line, xyz, xyzTarget, valueDisplay, slider.value));

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    animate(renderer, scene, camera);

})

function createKnots(numKnots, sineAmplitude, width) {
    const knots = [];
    for (let i = 0; i < numKnots; i++) {
        const t = i / (numKnots - 1); // 0 to 1
        const x = (t - 0.5) * width; // -5 to 5
        const y = Math.sin(t * 2 * Math.PI) * sineAmplitude; // One complete sine cycle
        knots.push(new THREE.Vector3(x, y, 0));
    }
    return knots;
}

function addKnotVisualization(scene, knots, color = 0xff0000) {
    // Add axes helper for reference
    const axesHelper = new THREE.AxesHelper(1);
    // scene.add(axesHelper);

    // Add spheres at each knot position
    const sphereGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: color });

    knots.forEach((knot, index) => {
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(knot);
        sphere.userData = { knotIndex: index };
        scene.add(sphere);
    });
}

function addDerivedPointsVisualization(scene, points, color = 0xffff00) {
    // Add smaller spheres at each derived point position
    const smallSphereGeometry = new THREE.SphereGeometry(0.05, 6, 6);
    const smallSphereMaterial = new THREE.MeshBasicMaterial({ color: color });

    points.forEach((point, index) => {
        const sphere = new THREE.Mesh(smallSphereGeometry, smallSphereMaterial);
        sphere.position.copy(point);
        sphere.userData = { derivedPointIndex: index };
        scene.add(sphere);
    });
}

function calculateBoundingBox(points) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    points.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    });

    return {
        min: new THREE.Vector3(minX, minY, minZ),
        max: new THREE.Vector3(maxX, maxY, maxZ),
        centroid: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
    };
}

function createHorizontalKnots(numKnots, y, width) {

    const knots = [];
    for (let i = 0; i < numKnots; i++) {
        const t = i / (numKnots - 1); // 0 to 1
        const x = (t - 0.5) * width
        knots.push(new THREE.Vector3(x, y, 0));
    }
    return knots;
}

function doLerp(line, src, dst, valueDisplay, interpolant) {

    const weight = parseFloat(interpolant);
    valueDisplay.textContent = weight.toFixed(2);

    const lerped = src.map((number, i) => number * (1 - weight) + dst[i] * weight);

    line.geometry.setPositions(lerped);

    if (line.computeLineDistances) {
        line.computeLineDistances();
    }

}

