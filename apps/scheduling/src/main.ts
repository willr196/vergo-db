import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { startRouter } from './lib/router.svelte';

startRouter();

export default mount(App, { target: document.getElementById('app')! });
