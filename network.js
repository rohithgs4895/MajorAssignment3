function simulate(data, svg) {
    const width = 2200;
    const height = 2200;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const main_group = svg.append("g").attr("transform", "translate(0, 50)");

    const authors = {};
    const nodes = [];
    const links = [];
    const countryCount = {};

    data.forEach((article, index) => {
        const authorNames = article.Authors.split(',').map(name => name.trim());
        const publisher = article.Publisher;
        const affiliationsList = article['Authors with affiliations'] ? article['Authors with affiliations'].split(';').map(aff => aff.trim()) : [];
        const country = article.Country;

        const authorAffiliationsMap = {};
        affiliationsList.forEach((aff) => {
            if (aff) {
                const parts = aff.split(',').map(item => item.trim());
                const name = `${parts[0]} ${parts[1]}`;
                const affiliation = parts.length > 1 ? parts.slice(1).join(', ') : 'Unknown affiliation';
                authorAffiliationsMap[name] = affiliation;
            }
        });

        if (country) {
            countryCount[country] = (countryCount[country] || 0) + 1;
        }

        authorNames.forEach(author => {
            if (!authors[author]) {
                authors[author] = { 
                    name: author,
                    affiliations: authorAffiliationsMap[author] || 'Unknown affiliation',
                    group: index,
                    country: country
                };
                nodes.push(authors[author]);
            }
        });

        for (let i = 0; i < authorNames.length; i++) {
            for (let j = i + 1; j < authorNames.length; j++) {
                const source = authorNames[i];
                const target = authorNames[j];
                const existingLink = links.find(link => 
                    (link.source === source && link.target === target) ||
                    (link.source === target && link.target === source)
                );

                if (existingLink) {
                    existingLink.value++;
                    existingLink.publishers.push(publisher);
                } else {
                    links.push({
                        source,
                        target,
                        value: 1,
                        publishers: [publisher]
                    });
                }
            }
        }
    });

    const topCountries = Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(entry => entry[0]);

    const color = d3.scaleLinear()
        .domain([0, Math.floor(topCountries.length / 2), topCountries.length - 1])
        .range(["#ffcccc", "#ff6666", "#0055ff"]); 

    const countryColorMap = topCountries.reduce((acc, country, index) => {
        acc[country] = color(index);
        return acc;
    }, {});

    const legend = d3.select("#country-list");
    topCountries.forEach(country => {
        legend.append("li")
            .style("color", countryColorMap[country])
            .text(`${country} (${countryCount[country]})`);
    });

    const filteredLinks = links.filter(link => link.publishers.length > 0);
    const connectedAuthors = new Set();
    filteredLinks.forEach(link => {
        connectedAuthors.add(link.source);
        connectedAuthors.add(link.target);
    });

    const filteredNodes = nodes.filter(node => connectedAuthors.has(node.name));
    const node_degree = {};
    filteredNodes.forEach(node => { node_degree[node.name] = 0; });
    filteredLinks.forEach(link => {
        node_degree[link.source]++;
        node_degree[link.target]++;
    });

    const scale_radius = d3.scaleSqrt()
        .domain(d3.extent(Object.values(node_degree)))
        .range([3, 12]);

    const scale_link_stroke_width = d3.scaleLinear()
        .domain(d3.extent(filteredLinks, d => d.value))
        .range([1, 5]);

    const tooltip = d3.select("#author-tooltip");

    const link_elements = main_group.append("g")
        .attr('transform', `translate(${width / 2},${height / 2})`)
        .selectAll(".line")
        .data(filteredLinks)
        .enter()
        .append("line")
        .style("stroke-width", d => scale_link_stroke_width(d.value))
        .style("stroke", "#aaa")
        .style("opacity", 0.6)
        .on("mouseover", (event, d) => {
            tooltip.style("visibility", "visible")
                .html(`Shared publications: ${d.publishers.join(', ')}`);
        })
        .on("mousemove", event => {
            tooltip.style("top", `${event.pageY - 10}px`)
                .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

    const node_elements = main_group.append("g")
        .attr('transform', `translate(${width / 2},${height / 2})`)
        .selectAll(".circle")
        .data(filteredNodes)
        .enter()
        .append('g')
        .attr("class", d => `gr_${d.group}`)
        .on("mouseenter", function (event, data) {
            node_elements.classed("inactive", true);
            d3.selectAll(`.gr_${data.group}`).classed("inactive", false);
        })
        .on("mouseleave", () => {
            d3.selectAll(".inactive").classed("inactive", false);
        })
        .on("click", function (event, d) {
            tooltip.style("visibility", "visible")
                .html(`Author: ${d.name}<br>Authors with affiliations: ${d.affiliations}`);
            tooltip.style("top", `${event.pageY - 10}px`)
                .style("left", `${event.pageX + 10}px`);
        });

    node_elements.append("circle")
        .attr("r", d => scale_radius(node_degree[d.name]))
        .attr("fill", d => countryColorMap[d.country] || "#a9a9a9");

    node_elements.append("text")
        .attr("class", "label")
        .attr("text-anchor", "middle")
        .text(d => d.name);

    const forceSimulation = d3.forceSimulation(filteredNodes)
        .force("collide", d3.forceCollide().radius(d => scale_radius(node_degree[d.name]) * 1.5))
        .force("x", d3.forceX())
        .force("y", d3.forceY())
        .force("charge", d3.forceManyBody().strength(-50))
        .force("link", d3.forceLink(filteredLinks)
            .id(d => d.name)
            .distance(150)
            .strength(0.5))
        .on("tick", ticked);

    function ticked() {
        node_elements.attr('transform', d => `translate(${d.x},${d.y})`);
        link_elements
            .attr("x1", d => d.source.x)
            .attr("x2", d => d.target.x)
            .attr("y1", d => d.source.y)
            .attr("y2", d => d.target.y);
    }

    svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([1, 8])
        .on("zoom", zoomed));

    function zoomed({ transform }) {
        main_group.attr("transform", transform);
    }

    const controls = d3.select("#controls").append("div").attr("class", "controls");

    controls.append("label").text("Charge Strength: ");
    controls.append("input")
        .attr("type", "range")
        .attr("min", -100)
        .attr("max", 100)
        .attr("value", -50)
        .on("input", function () {
            const chargeStrength = +this.value;
            forceSimulation.force("charge").strength(chargeStrength);
            forceSimulation.alpha(1).restart();
        });

    controls.append("label").text("Force Collide: ");
    controls.append("input")
        .attr("type", "range")
        .attr("min", 1)
        .attr("max", 5)
        .attr("value", 1.5)
        .on("input", function () {
            const radiusFactor = +this.value;
            forceSimulation.force("collide").radius(d => scale_radius(node_degree[d.name]) * radiusFactor);
            forceSimulation.alpha(1).restart();
        });

    controls.append("label").text("Link Strength: ");
    controls.append("input")
        .attr("type", "range")
        .attr("min", 0.01)
        .attr("max", 1)
        .attr("value", 0.5)
        .on("input", function () {
            const linkStrength = +this.value;
            forceSimulation.force("link").strength(linkStrength);
            forceSimulation.alpha(1).restart();
        });
}
