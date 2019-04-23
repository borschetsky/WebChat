import React from 'react';
import {BrowserRouter, Switch, Route } from 'react-router-dom';
import Home from './Home';
import AuthenticatedComponent from './AuthenticatedComponent';
import Login from './Login';
import Register from './Register';
import Dashboard from './Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/login" component={Login}/>
        <Route path="/" exact component={Home}/>
        <Route path="/register" component={Register} /> 
            <Route path="/dashboard" component={Dashboard}/>
        
        
      </Switch>
    </BrowserRouter>
  );
}

export default App;
