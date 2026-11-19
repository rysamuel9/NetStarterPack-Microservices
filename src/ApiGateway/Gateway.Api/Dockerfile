# ==============================================================================
# Multi-Stage Dockerfile — Gateway.Api (YARP API Gateway - Port 5080)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj", "src/BuildingBlocks/BuildingBlocks.Core/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj", "src/BuildingBlocks/BuildingBlocks.Security/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj", "src/BuildingBlocks/BuildingBlocks.Infrastructure/"]
COPY ["src/ApiGateway/Gateway.Api/Gateway.Api.csproj", "src/ApiGateway/Gateway.Api/"]
COPY ["src/Services/Identity/Identity.Api/Identity.Api.csproj", "src/Services/Identity/Identity.Api/"]
COPY ["src/Services/Catalog/Catalog.Api/Catalog.Api.csproj", "src/Services/Catalog/Catalog.Api/"]
COPY ["src/Services/Order/Order.Api/Order.Api.csproj", "src/Services/Order/Order.Api/"]
COPY ["src/Services/Workflow/Workflow.Api/Workflow.Api.csproj", "src/Services/Workflow/Workflow.Api/"]
COPY ["src/Services/Announcement/Announcement.Api/Announcement.Api.csproj", "src/Services/Announcement/Announcement.Api/"]

RUN dotnet restore "src/ApiGateway/Gateway.Api/Gateway.Api.csproj"

COPY ["src/BuildingBlocks/", "src/BuildingBlocks/"]
COPY ["src/ApiGateway/Gateway.Api/", "src/ApiGateway/Gateway.Api/"]
COPY ["src/Services/Identity/Identity.Api/", "src/Services/Identity/Identity.Api/"]
COPY ["src/Services/Catalog/Catalog.Api/", "src/Services/Catalog/Catalog.Api/"]
COPY ["src/Services/Order/Order.Api/", "src/Services/Order/Order.Api/"]
COPY ["src/Services/Workflow/Workflow.Api/", "src/Services/Workflow/Workflow.Api/"]
COPY ["src/Services/Announcement/Announcement.Api/", "src/Services/Announcement/Announcement.Api/"]

WORKDIR "/src/src/ApiGateway/Gateway.Api"
RUN dotnet publish "Gateway.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5080
ENV ASPNETCORE_URLS=http://+:5080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Gateway.Api.dll"]
