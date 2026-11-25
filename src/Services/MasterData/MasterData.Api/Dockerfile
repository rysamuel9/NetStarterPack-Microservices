# ==============================================================================
# Multi-Stage Dockerfile — MasterData.Api (Unified Lookup Microservice - Port 5086)
# ==============================================================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj", "src/BuildingBlocks/BuildingBlocks.Core/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj", "src/BuildingBlocks/BuildingBlocks.Security/"]
COPY ["src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj", "src/BuildingBlocks/BuildingBlocks.Infrastructure/"]
COPY ["src/Services/MasterData/MasterData.Api/MasterData.Api.csproj", "src/Services/MasterData/MasterData.Api/"]

RUN dotnet restore "src/Services/MasterData/MasterData.Api/MasterData.Api.csproj"

COPY ["src/BuildingBlocks/", "src/BuildingBlocks/"]
COPY ["src/Services/MasterData/MasterData.Api/", "src/Services/MasterData/MasterData.Api/"]

WORKDIR "/src/src/Services/MasterData/MasterData.Api"
RUN dotnet publish "MasterData.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5086
ENV ASPNETCORE_URLS=http://+:5086
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "MasterData.Api.dll"]
