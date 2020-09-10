import React from 'react';
import {BrowserRouter, Switch, Route } from 'react-router-dom';
import Login from './Login';
import {Register} from './Register';
import Dashboard from './Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/login" component={Login}/>
        <Route path="/" exact component={Dashboard}/>
        <Route path="/register" component={Register} /> 
            <Route path="/dashboard" component={Dashboard}/>
      </Switch>
    </BrowserRouter>
  );
}

export default App;
