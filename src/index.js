import * as d3 from 'd3';

/**
 * Visualizes Spring Beans dependencies as reported by the
 * /beans Spring Boot Actuator endpoint.
 * See https://docs.spring.io/spring-boot/docs/current/actuator-api/htmlsingle/#beans.retrieving.response-structure
 */

/** node (bean representation) circle radius */
const radius = 5;

/**
 * Maps bean names to group numbers for coloring.
 * @param {string} name the name to map
 * @return {int} a group (integer)
 */
const groupMapper = (name) => {
  if (name.startsWith('org.springframework')) {
    return 2;
  }
  if (name.startsWith('org.')) {
    return 3;
  }
  if (name.startsWith('com.')) {
    return 4;
  }
  return 1;
};

// eslint-disable-next-line max-len
const round = (num = 0, decimals = 2) => Math.round(num * 10 ** decimals) / 10 ** decimals;

/**
 * SVG path for a line with arrow.
 * @param {*} link the link information for the line
 * @return {string} the path instruction
 */
const arrowPath = (link) => {
  const vector = {
    dx: link.target.x - link.source.x,
    dy: link.target.y - link.source.y,
  };
  const length = Math.sqrt(vector.dx * vector.dx + vector.dy * vector.dy);
  vector.dx /= length;
  vector.dy /= length;
  vector.dx = vector.dx * Math.max(0, length - radius - 1);
  vector.dy = vector.dy * Math.max(0, length - radius - 1);
  // eslint-disable-next-line max-len
  return `M${link.source.x},${link.source.y} l ${round(vector.dx)},${round(vector.dy)}`;
};

let lastModel;

/**
 * Loads and parses an uploaded file.
 * @param {*} evt the file selection event
 */
const readFile = (evt) => {
  if (evt.target.files && evt.target.files.length > 0) {
    const file = evt.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      clear();
      lastModel = JSON.parse(event.target.result);
      if (lastModel.contexts && Object.keys(lastModel.contexts).length > 0) {
        render(lastModel);
      } else {
        lastModel = undefined;
        alert('Invalid format?');
      }
    };
    reader.readAsText(file);
  }
};

const init = () => {
  document
      .querySelector('#file')
      .addEventListener('change', readFile, false);
  document
      .querySelector('#reset')
      .addEventListener('click', () => {
        if (lastModel) {
          clear();
          render(lastModel);
        }
      });
};

const clear = () => {
  const svg = document.querySelector('#main svg');
  for (const child of svg.children) {
    if (child.tagName === 'g') {
      svg.removeChild(child);
    }
  }
  svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
};

const render = (inData) => {
  const viewBox = document.querySelector('#main svg')
      .getAttribute('viewBox')
      .split(' ');
  const width = viewBox[2];
  const height = viewBox[3];

  const data = {
    nodes: [],
    links: [],
  };
  const name2iid = (name) => {
    const element = data.nodes.find((element) => element.id === name);
    if (element) {
      return element.iid;
    }
    return '';
  };

  const nodeNames = new Set();
  const linkNames = new Set();
  let counter = 0;

  Object
      .keys(inData.contexts)
      .forEach((ctxName) => {
        if (inData.contexts[ctxName].beans) {
          for (const name in inData.contexts[ctxName].beans) {
            if (inData.contexts.application.beans.hasOwnProperty(name)) {
              const bean = inData.contexts.application.beans[name];
              nodeNames.add(name);
              data.nodes.push({
                id: name,
                iid: ++counter,
                group: groupMapper(name),
                resource: bean.resource,
              });
              bean.dependencies.forEach((dependency) => {
                linkNames.add(dependency);
                data.links.push({
                  source: name,
                  target: dependency,
                  value: bean.dependencies.length,
                });
              });
            }
          };
        }
      });
  linkNames
      .forEach((link) => {
        if (!nodeNames.has(link)) {
          data.nodes.push({
            id: link,
            iid: ++counter,
            group: 0,
          });
        }
      });
  data
      .links
      // eslint-disable-next-line max-len
      .forEach((link) => link.iid = `l${name2iid(link.source)}_${name2iid(link.target)}`);

  const markDependencies = (id, transitive) => {
    data.links
        .filter((n) => n.source === id)
        .forEach((d) => {
          // eslint-disable-next-line max-len
          const link = document.querySelector(`#l${name2iid(id)}_${name2iid(d.target)}`);
          if (link) {
            link.setAttribute('stroke', '#f00');
            link.setAttribute('marker-end', 'url(#redhead)');
            link.setAttribute('class', 'dashflow');
            link.parentElement.appendChild(link);
            if (transitive) {
              markDependencies(d.target, transitive);
            }
          }
        });
  };
  const root = document.querySelector('#root');
  const rootNew = root.cloneNode(false);
  root.parentElement.replaceChild(rootNew, root);
  const mark = (e) => {
    const current = e.target.value;
    if (nodeNames.has(current)) {
      markDependencies(current, document.querySelector('#transitive').checked);
      const circle = document.querySelector(`#c${name2iid(current)}`);
      circle.setAttribute('fill', '#f00');
      const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      anim.setAttribute('attributeName', 'r');
      anim.setAttribute('dur', '1s');
      anim.setAttribute('values', `${radius};${1.5 * radius};${radius}`);
      anim.setAttribute('repeatCount', 'indefinite');
      circle.appendChild(anim);
      anim.beginElement();
    }
  };
  rootNew.addEventListener('blur', mark);
  rootNew.addEventListener('keyup', (e) => {
    if (e.keyCode === 13) {
      mark(e);
    }
  });

  const options = document.querySelector('#node-list');
  options.innerHTML = '';
  let optLen = 0;
  data
      .nodes
      .map((item) => item.id)
      .sort()
      .forEach((id) => {
        optLen = Math.max(optLen, id.length);
        const option = document.createElement('option');
        option.setAttribute('value', id);
        options.appendChild(option);
      });
  rootNew.setAttribute('size', optLen);

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const links = data.links.map((d) => ({...d}));
  const nodes = data.nodes.map((d) => ({...d}));

  const ticked = () => {
    link
        .attr('d', (d) => arrowPath(d));
    node
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y);
  };

  d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id))
      .force('charge', d3.forceManyBody().strength(-16))
      .force('collide', d3.forceCollide(radius))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', ticked);

  const svg = d3.select('#main svg g');

  const handleZoom = (e) => {
    d3.select('#main svg g')
        .attr('transform', e.transform);
  };
  const zoom = d3.zoom();

  svg
      .call(zoom
          .translateExtent([[0, 0], [width, height]])
          .on('zoom', handleZoom),
      );

  svg
      .append('g')
      .append('rect')
      .attr('fill', 'white')
      .attr('fill-opacity', 0)
      .attr('width', width)
      .attr('height', height);

  const link = svg.append('g')
      .attr('stroke', '#999')
      .selectAll()
      .data(links)
      .join('path')
      .attr('id', (d) => d.iid)
      .attr('marker-end', 'url(#head)')
      .attr('stroke-width', (d) => round(Math.sqrt(d.value)))
      .attr('d', (d) => arrowPath(d));

  const node = svg.append('g')
      .attr('stroke', 'none')
      .selectAll()
      .data(nodes)
      .join('circle')
      .attr('id', (d) => `c${d.iid}`)
      .attr('r', radius)
      .attr('fill', (d) => color(d.group))
      .attr('data-resource', (d) => d.resource || 'unknown source')
      .on('click', (e) => alert(e.target.getAttribute('data-resource')));

  node.append('title')
      .text((d) => d.id);
};

init();
